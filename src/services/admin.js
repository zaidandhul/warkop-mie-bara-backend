import { pool, withTransaction } from '../db.js'
import { ORDER_ITEM_COLUMNS, PAID_METHODS, toOrderItem } from './orders.js'
import { orderHistory, recordAudit } from './audit.js'
import { todayWib, wibDayRange } from '../utils/time.js'

export const ORDER_STATUSES = ['menunggu', 'diproses', 'siap', 'selesai', 'dibatalkan']
const MAX_PRICE = 10_000_000

// Status berikutnya yang boleh dari setiap status.
export const TRANSITIONS = {
  menunggu: ['diproses', 'dibatalkan'],
  diproses: ['siap', 'dibatalkan'],
  siap: ['selesai'],
  selesai: [],
  dibatalkan: [],
}

function fail(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode })
}

// Masalah perubahan status (pesan + statusCode) atau null bila boleh. paid = pesanan sudah lunas.
export function transitionProblem(current, next, paid = false) {
  if (!ORDER_STATUSES.includes(next)) return { message: 'Status pesanan tidak dikenal.', statusCode: 400 }
  if (current === next) return { message: `Pesanan sudah berstatus "${current}".`, statusCode: 409 }
  if (!TRANSITIONS[current]?.includes(next)) return { message: `Status tidak bisa diubah dari "${current}" ke "${next}".`, statusCode: 400 }
  if (next === 'dibatalkan' && paid) {
    return { message: 'Pesanan sudah lunas. Batalkan status lunas dulu sebelum membatalkan pesanan.', statusCode: 400 }
  }
  return null
}

export async function listOrders({ status, date } = {}) {
  const day = date ? date : todayWib()
  const range = wibDayRange(day)
  if (!range) throw fail('Tanggal tidak valid. Gunakan format YYYY-MM-DD.')
  if (status && !ORDER_STATUSES.includes(status)) throw fail('Status pesanan tidak dikenal.')

  const params = [range.start, range.end]
  let statusFilter = ''
  if (status) {
    statusFilter = 'AND o.status = ?'
    params.push(status)
  }
  const [orders] = await pool.execute(
    `SELECT o.id AS internalId, o.order_code AS id, o.status, o.table_number AS tableNumber,
            o.customer_name AS customerName, o.customer_phone AS customerPhone, o.payment_method AS paymentMethod, o.source,
            o.subtotal, o.fee, o.total, o.paid_at AS paidAt, o.paid_method AS paidMethod,
            o.created_at AS createdAt, o.updated_at AS updatedAt,
            creator.username AS createdBy, payer.username AS paidBy
       FROM orders o
       LEFT JOIN staff_users creator ON creator.id = o.created_by_staff_id
       LEFT JOIN staff_users payer ON payer.id = o.paid_by_staff_id
      WHERE o.created_at >= ? AND o.created_at < ? ${statusFilter}
      ORDER BY o.created_at, o.id`, params
  )
  if (!orders.length) return { date: day, orders: [] }

  const placeholders = orders.map(() => '?').join(',')
  const [items] = await pool.execute(
    `SELECT order_id AS orderId, ${ORDER_ITEM_COLUMNS}
       FROM order_items WHERE order_id IN (${placeholders}) ORDER BY id`, orders.map((order) => order.internalId)
  )
  const history = await orderHistory(orders.map((order) => order.id))
  return {
    date: day,
    orders: orders.map(({ internalId, ...order }) => ({
      ...order,
      items: items.filter((item) => item.orderId === internalId).map(toOrderItem),
      history: history.get(order.id) ?? [],
    })),
  }
}

export async function updateOrderStatus(orderCode, nextStatus, staffId = null) {
  if (!ORDER_STATUSES.includes(nextStatus)) throw fail('Status pesanan tidak dikenal.')
  return withTransaction(async (connection) => {
    const [rows] = await connection.execute('SELECT status, paid_at FROM orders WHERE order_code = ?', [orderCode])
    if (!rows.length) throw fail('Pesanan tidak ditemukan.', 404)
    const current = rows[0].status
    const problem = transitionProblem(current, nextStatus, Boolean(rows[0].paid_at))
    if (problem) throw fail(problem.message, problem.statusCode)
    const cancelling = nextStatus === 'dibatalkan'

    // WHERE status = current: kalau tablet lain sudah mengubahnya duluan, tidak ada baris yang berubah.
    // Pembatalan juga mensyaratkan belum lunas, kalau kasir menandai lunas di saat yang sama.
    const [result] = await connection.execute(
      `UPDATE orders SET status = ? WHERE order_code = ? AND status = ?${cancelling ? ' AND paid_at IS NULL' : ''}`,
      [nextStatus, orderCode, current]
    )
    if (!result.affectedRows) throw fail('Pesanan sudah diubah staf lain. Muat ulang lalu coba lagi.', 409)
    await recordAudit(connection, { staffId, action: 'order_status', entityId: orderCode, oldValue: current, newValue: nextStatus })
    return { id: orderCode, status: nextStatus }
  })
}

// method 'tunai' | 'qris_manual' menandai lunas; null membatalkan tanda lunas (salah pencet).
export async function updateOrderPayment(orderCode, method, staffId) {
  if (method !== null && !PAID_METHODS.includes(method)) {
    throw fail('Metode pembayaran harus "tunai" atau "qris_manual" (atau null untuk membatalkan lunas).')
  }
  return withTransaction(async (connection) => {
    const [before] = await connection.execute(
      'SELECT status, paid_method AS paidMethod FROM orders WHERE order_code = ? FOR UPDATE', [orderCode]
    )
    if (!before.length) throw fail('Pesanan tidak ditemukan.', 404)
    const [result] = method
      ? await connection.execute(
        `UPDATE orders SET paid_at = CURRENT_TIMESTAMP, paid_method = ?, paid_by_staff_id = ?
          WHERE order_code = ? AND paid_at IS NULL AND status <> 'dibatalkan'`, [method, staffId, orderCode]
      )
      : await connection.execute(
        `UPDATE orders SET paid_at = NULL, paid_method = NULL, paid_by_staff_id = NULL
          WHERE order_code = ? AND paid_at IS NOT NULL`, [orderCode]
      )
    if (!result.affectedRows) {
      if (method && before[0].status === 'dibatalkan') throw fail('Pesanan yang dibatalkan tidak bisa ditandai lunas.')
      throw fail(method ? 'Pesanan sudah ditandai lunas.' : 'Pesanan belum ditandai lunas.', 409)
    }
    await recordAudit(connection, {
      staffId, action: 'order_payment', entityId: orderCode, oldValue: before[0].paidMethod, newValue: method,
    })
    const [rows] = await connection.execute(
      'SELECT paid_at AS paidAt, paid_method AS paidMethod FROM orders WHERE order_code = ?', [orderCode]
    )
    return { id: orderCode, paidAt: rows[0].paidAt, paidMethod: rows[0].paidMethod }
  })
}

export async function listMenu() {
  const [items] = await pool.execute(
    `SELECT m.id, m.name, m.price, m.is_active AS isActive, m.category_id AS categoryId, c.name AS categoryName
       FROM menu_items m JOIN categories c ON c.id = m.category_id
      ORDER BY c.sort_order, c.name, m.sort_order, m.name`
  )
  return items.map((item) => ({ ...item, isActive: Boolean(item.isActive) }))
}

const availability = (active) => (active ? 'tersedia' : 'habis')

export async function updateMenuItem(id, body, staffId = null) {
  const changes = body && typeof body === 'object' ? body : {}
  if ('isActive' in changes && typeof changes.isActive !== 'boolean') throw fail('isActive harus true atau false.')
  if ('price' in changes) {
    const price = changes.price
    if (!Number.isInteger(price) || price < 0 || price > MAX_PRICE) {
      throw fail(`Harga harus bilangan bulat Rupiah dari 0 sampai ${MAX_PRICE.toLocaleString('id-ID')}.`)
    }
  }
  if (!('isActive' in changes) && !('price' in changes)) throw fail('Tidak ada perubahan. Kirim isActive dan/atau price.')

  return withTransaction(async (connection) => {
    const [before] = await connection.execute('SELECT price, is_active AS isActive FROM menu_items WHERE id = ? FOR UPDATE', [id])
    if (!before.length) throw fail('Menu tidak ditemukan.', 404)
    const old = { price: before[0].price, isActive: Boolean(before[0].isActive) }
    const sets = []
    const params = []
    if ('isActive' in changes) {
      sets.push('is_active = ?')
      params.push(changes.isActive ? 1 : 0)
    }
    if ('price' in changes) {
      sets.push('price = ?')
      params.push(changes.price)
    }
    await connection.execute(`UPDATE menu_items SET ${sets.join(', ')} WHERE id = ?`, [...params, id])
    // Hanya perubahan nilai yang sebenarnya yang dicatat.
    if ('price' in changes && changes.price !== old.price) {
      await recordAudit(connection, { staffId, action: 'menu_price', entityId: id, oldValue: old.price, newValue: changes.price })
    }
    if ('isActive' in changes && changes.isActive !== old.isActive) {
      await recordAudit(connection, {
        staffId, action: 'menu_availability', entityId: id, oldValue: availability(old.isActive), newValue: availability(changes.isActive),
      })
    }
    const [rows] = await connection.execute(
      'SELECT id, name, price, is_active AS isActive, category_id AS categoryId FROM menu_items WHERE id = ?', [id]
    )
    return { ...rows[0], isActive: Boolean(rows[0].isActive) }
  })
}
