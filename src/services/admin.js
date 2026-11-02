import { pool } from '../db.js'
import { ORDER_ITEM_COLUMNS, PAID_METHODS, toOrderItem } from './orders.js'
import { todayWib, wibDayRange } from '../utils/time.js'

export const ORDER_STATUSES = ['menunggu', 'diproses', 'siap', 'selesai', 'dibatalkan']
const MAX_PRICE = 10_000_000

// Status berikutnya yang boleh dari setiap status.
const TRANSITIONS = {
  menunggu: ['diproses', 'dibatalkan'],
  diproses: ['siap', 'dibatalkan'],
  siap: ['selesai'],
  selesai: [],
  dibatalkan: [],
}

function fail(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode })
}

export async function listOrders({ status, date } = {}) {
  const day = date ? date : todayWib()
  const range = wibDayRange(day)
  if (!range) throw fail('Tanggal tidak valid. Gunakan format YYYY-MM-DD.')
  if (status && !ORDER_STATUSES.includes(status)) throw fail('Status pesanan tidak dikenal.')

  const params = [range.start, range.end]
  let statusFilter = ''
  if (status) {
    statusFilter = 'AND status = ?'
    params.push(status)
  }
  const [orders] = await pool.execute(
    `SELECT id AS internalId, order_code AS id, status, table_number AS tableNumber,
            customer_name AS customerName, customer_phone AS customerPhone, payment_method AS paymentMethod, source,
            subtotal, fee, total, paid_at AS paidAt, paid_method AS paidMethod,
            created_at AS createdAt, updated_at AS updatedAt
       FROM orders WHERE created_at >= ? AND created_at < ? ${statusFilter}
      ORDER BY created_at, id`, params
  )
  if (!orders.length) return { date: day, orders: [] }

  const placeholders = orders.map(() => '?').join(',')
  const [items] = await pool.execute(
    `SELECT order_id AS orderId, ${ORDER_ITEM_COLUMNS}
       FROM order_items WHERE order_id IN (${placeholders}) ORDER BY id`, orders.map((order) => order.internalId)
  )
  return {
    date: day,
    orders: orders.map(({ internalId, ...order }) => ({
      ...order,
      items: items.filter((item) => item.orderId === internalId).map(toOrderItem),
    })),
  }
}

export async function updateOrderStatus(orderCode, nextStatus) {
  if (!ORDER_STATUSES.includes(nextStatus)) throw fail('Status pesanan tidak dikenal.')
  const [rows] = await pool.execute('SELECT status, paid_at FROM orders WHERE order_code = ?', [orderCode])
  if (!rows.length) throw fail('Pesanan tidak ditemukan.', 404)
  const current = rows[0].status
  if (current === nextStatus) throw fail(`Pesanan sudah berstatus "${current}".`, 409)

  if (!TRANSITIONS[current].includes(nextStatus)) {
    throw fail(`Status tidak bisa diubah dari "${current}" ke "${nextStatus}".`)
  }
  const cancelling = nextStatus === 'dibatalkan'
  if (cancelling && rows[0].paid_at) {
    throw fail('Pesanan sudah lunas. Batalkan status lunas dulu sebelum membatalkan pesanan.')
  }

  // WHERE status = current: kalau tablet lain sudah mengubahnya duluan, tidak ada baris yang berubah.
  // Pembatalan juga mensyaratkan belum lunas, kalau kasir menandai lunas di saat yang sama.
  const [result] = await pool.execute(
    `UPDATE orders SET status = ? WHERE order_code = ? AND status = ?${cancelling ? ' AND paid_at IS NULL' : ''}`,
    [nextStatus, orderCode, current]
  )
  if (!result.affectedRows) throw fail('Pesanan sudah diubah staf lain. Muat ulang lalu coba lagi.', 409)
  return { id: orderCode, status: nextStatus }
}

// method 'tunai' | 'qris_manual' menandai lunas; null membatalkan tanda lunas (salah pencet).
export async function updateOrderPayment(orderCode, method, staffId) {
  if (method !== null && !PAID_METHODS.includes(method)) {
    throw fail('Metode pembayaran harus "tunai" atau "qris_manual" (atau null untuk membatalkan lunas).')
  }
  const [result] = method
    ? await pool.execute(
      `UPDATE orders SET paid_at = CURRENT_TIMESTAMP, paid_method = ?, paid_by_staff_id = ?
        WHERE order_code = ? AND paid_at IS NULL AND status <> 'dibatalkan'`, [method, staffId, orderCode]
    )
    : await pool.execute(
      `UPDATE orders SET paid_at = NULL, paid_method = NULL, paid_by_staff_id = NULL
        WHERE order_code = ? AND paid_at IS NOT NULL`, [orderCode]
    )
  const [rows] = await pool.execute(
    'SELECT status, paid_at AS paidAt, paid_method AS paidMethod FROM orders WHERE order_code = ?', [orderCode]
  )
  if (!rows.length) throw fail('Pesanan tidak ditemukan.', 404)
  const order = rows[0]
  if (!result.affectedRows) {
    if (method && order.status === 'dibatalkan') throw fail('Pesanan yang dibatalkan tidak bisa ditandai lunas.')
    throw fail(method ? 'Pesanan sudah ditandai lunas.' : 'Pesanan belum ditandai lunas.', 409)
  }
  return { id: orderCode, paidAt: order.paidAt, paidMethod: order.paidMethod }
}

export async function listMenu() {
  const [items] = await pool.execute(
    `SELECT m.id, m.name, m.price, m.is_active AS isActive, m.category_id AS categoryId, c.name AS categoryName
       FROM menu_items m JOIN categories c ON c.id = m.category_id
      ORDER BY c.sort_order, c.name, m.sort_order, m.name`
  )
  return items.map((item) => ({ ...item, isActive: Boolean(item.isActive) }))
}

export async function updateMenuItem(id, body) {
  const changes = body && typeof body === 'object' ? body : {}
  const sets = []
  const params = []
  if ('isActive' in changes) {
    if (typeof changes.isActive !== 'boolean') throw fail('isActive harus true atau false.')
    sets.push('is_active = ?')
    params.push(changes.isActive ? 1 : 0)
  }
  if ('price' in changes) {
    const price = changes.price
    if (!Number.isInteger(price) || price < 0 || price > MAX_PRICE) {
      throw fail(`Harga harus bilangan bulat Rupiah dari 0 sampai ${MAX_PRICE.toLocaleString('id-ID')}.`)
    }
    sets.push('price = ?')
    params.push(price)
  }
  if (!sets.length) throw fail('Tidak ada perubahan. Kirim isActive dan/atau price.')

  const [result] = await pool.execute(`UPDATE menu_items SET ${sets.join(', ')} WHERE id = ?`, [...params, id])
  if (!result.affectedRows) throw fail('Menu tidak ditemukan.', 404)
  const [rows] = await pool.execute(
    'SELECT id, name, price, is_active AS isActive, category_id AS categoryId FROM menu_items WHERE id = ?', [id]
  )
  return { ...rows[0], isActive: Boolean(rows[0].isActive) }
}
