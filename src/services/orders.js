import { randomUUID } from 'node:crypto'
import { pool } from '../db.js'
import { jsonArray } from '../utils/json.js'
import { TABLE_COUNT, isUuid, normalizePhone, normalizeTableNumber } from '../utils/validation.js'

// Metode bayar di kasir saat pesanan ditandai lunas (kolom orders.paid_method).
export const PAID_METHODS = ['tunai', 'qris_manual']

function invalid(message) {
  return Object.assign(new Error(message), { statusCode: 400 })
}

async function findOrderCodeByIdempotencyKey(connection, idempotencyKey) {
  const [rows] = await connection.execute('SELECT order_code FROM orders WHERE idempotency_key = ?', [idempotencyKey])
  return rows[0]?.order_code ?? null
}

async function readOrder(connection, orderCode) {
  const [orders] = await connection.execute(
    `SELECT order_code AS id, status, table_number AS tableNumber,
            payment_method AS paymentMethod, paid_at IS NOT NULL AS paid, subtotal, fee, total, created_at AS createdAt
       FROM orders WHERE order_code = ?`, [orderCode]
  )
  if (!orders.length) return null
  const order = orders[0]
  order.paid = Boolean(order.paid)
  const [items] = await connection.execute(
    `SELECT ${ORDER_ITEM_COLUMNS}
       FROM order_items WHERE order_id = (SELECT id FROM orders WHERE order_code = ?) ORDER BY id`, [orderCode]
  )
  order.items = items.map(toOrderItem)
  return order
}

// Baris order_items (dengan alias seperti di ORDER_ITEM_COLUMNS) -> bentuk item untuk API.
export const ORDER_ITEM_COLUMNS = `menu_item_id AS itemId, item_name AS name, qty, unit_price AS unitPrice,
            line_total AS lineTotal, level_value AS level, variant, note, toppings_snapshot AS toppings`

export function toOrderItem(item) {
  const toppingDetails = jsonArray(item.toppings)
  return {
    itemId: item.itemId,
    name: item.name,
    qty: item.qty,
    unitPrice: item.unitPrice,
    lineTotal: item.lineTotal,
    toppingDetails,
    options: {
      level: item.level,
      variant: item.variant,
      toppings: toppingDetails.map((topping) => topping.id),
      note: item.note ?? '',
    },
  }
}

// Mengembalikan { order, created }. created = false berarti Idempotency-Key yang sama sudah pernah
// dipakai dan pesanan lama dikembalikan tanpa membuat pesanan baru.
// staffId diisi untuk pesanan yang diinput kasir dari dashboard (source 'kasir'); hanya pesanan kasir
// yang boleh langsung lunas lewat paidMethod.
export async function createOrder(payload, { idempotencyKey = null, staffId = null, paidMethod = null } = {}) {
  if (paidMethod !== null && (!staffId || !PAID_METHODS.includes(paidMethod))) {
    throw invalid('Status lunas harus "tunai", "qris_manual", atau kosong (belum bayar).')
  }
  if (idempotencyKey !== null && !isUuid(idempotencyKey)) {
    throw invalid('Kunci pesanan (Idempotency-Key) tidak valid. Muat ulang halaman pembayaran lalu coba lagi.')
  }
  if (idempotencyKey) {
    const existingCode = await findOrderCodeByIdempotencyKey(pool, idempotencyKey)
    if (existingCode) return { order: await readOrder(pool, existingCode), created: false }
  }

  if (!payload || !Array.isArray(payload.items) || payload.items.length === 0) {
    throw invalid('Pesanan harus berisi minimal satu item.')
  }
  if (payload.items.length > 50) throw invalid('Pesanan terlalu banyak item (maksimal 50 baris).')

  const tableNumber = normalizeTableNumber(payload.tableNumber)
  if (!tableNumber) throw invalid(`Nomor meja tidak valid. Gunakan angka 1 sampai ${TABLE_COUNT}.`)
  const customer = payload.customer && typeof payload.customer === 'object' ? payload.customer : {}
  // Kasir boleh tidak menanyakan nama; pesanannya dinamai sesuai meja.
  const name = (typeof customer.name === 'string' ? customer.name.trim() : '') || (staffId ? `Meja ${tableNumber}` : '')
  if (name.length < 2 || name.length > 100) throw invalid('Nama pemesan wajib diisi, 2 sampai 100 karakter.')
  const phone = normalizePhone(typeof customer.phone === 'string' ? customer.phone : '')
  if (phone === null) {
    throw invalid('Nomor HP tidak valid. Gunakan nomor HP Indonesia yang diawali 08, +62, atau 62 (10–13 digit).')
  }
  // Hanya bayar di kasir. Tanpa payment gateway, pesanan 'online' akan terlihat seperti sudah dibayar
  // padahal belum; nilai 'online' di kolom hanya tersisa untuk data lama.
  const paymentMethod = staffId ? 'cashier' : payload.paymentMethod
  if (paymentMethod === 'online') throw invalid('Pembayaran online belum tersedia. Silakan bayar di kasir.')
  if (paymentMethod !== 'cashier') throw invalid('Metode pembayaran tidak valid.')

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [settings] = await connection.execute(
      "SELECT setting_key, setting_value FROM app_settings WHERE setting_key IN ('other_fee', 'level_price_step') FOR UPDATE"
    )
    const settingMap = Object.fromEntries(settings.map((row) => [row.setting_key, Number(row.setting_value)]))
    const fee = settingMap.other_fee ?? 0
    const levelPriceStep = settingMap.level_price_step ?? 0
    const orderItems = []

    for (const input of payload.items) {
      if (!input || typeof input.itemId !== 'string') throw invalid('Setiap item harus memiliki itemId.')
      const [rows] = await connection.execute(
        `SELECT id, name, price, levels_json, options_json, allowed_toppings_json, is_active
           FROM menu_items WHERE id = ? FOR UPDATE`, [input.itemId]
      )
      const menuItem = rows[0]
      if (!menuItem) throw invalid(`Menu "${input.itemId}" tidak ditemukan. Muat ulang menu lalu coba lagi.`)
      if (!menuItem.is_active) throw invalid(`${menuItem.name} sedang tidak tersedia. Hapus dari keranjang lalu coba lagi.`)
      const qty = Number(input.qty)
      if (!Number.isInteger(qty) || qty < 1 || qty > 50) throw invalid(`Jumlah ${menuItem.name} harus 1 sampai 50.`)

      const levels = jsonArray(menuItem.levels_json)
      const variants = jsonArray(menuItem.options_json)
      const allowedToppings = jsonArray(menuItem.allowed_toppings_json)

      const options = input.options && typeof input.options === 'object' ? input.options : {}
      const level = options.level == null || options.level === '' ? null : Number(options.level)
      if (level !== null) {
        if (!levels.length) throw invalid(`${menuItem.name} tidak memiliki pilihan level.`)
        if (!levels.includes(level)) {
          throw invalid(`Level ${options.level} tidak tersedia untuk ${menuItem.name}. Pilihan: ${levels.join(', ')}.`)
        }
      }
      const variant = options.variant == null || options.variant === '' ? null : String(options.variant)
      if (variant !== null) {
        if (!variants.length) throw invalid(`${menuItem.name} tidak memiliki pilihan varian.`)
        if (!variants.includes(variant)) throw invalid(`Varian "${variant}" tidak tersedia untuk ${menuItem.name}.`)
      }

      const selectedToppings = options.toppings ?? []
      if (!Array.isArray(selectedToppings) || selectedToppings.some((id) => typeof id !== 'string')
        || new Set(selectedToppings).size !== selectedToppings.length) {
        throw invalid(`Daftar topping untuk ${menuItem.name} tidak valid.`)
      }
      if (selectedToppings.length && !allowedToppings.length) throw invalid(`${menuItem.name} tidak bisa diberi topping.`)
      const notAllowed = selectedToppings.find((id) => !allowedToppings.includes(id))
      if (notAllowed) throw invalid(`Topping "${notAllowed}" tidak tersedia untuk ${menuItem.name}.`)

      let toppingRows = []
      if (selectedToppings.length) {
        const placeholders = selectedToppings.map(() => '?').join(',')
        const [found] = await connection.execute(
          `SELECT id, name, price FROM toppings WHERE is_active = 1 AND id IN (${placeholders})`, selectedToppings
        )
        const inactive = selectedToppings.find((id) => !found.some((topping) => topping.id === id))
        if (inactive) throw invalid(`Topping "${inactive}" sedang tidak tersedia. Ubah pesanan ${menuItem.name} lalu coba lagi.`)
        toppingRows = selectedToppings.map((id) => found.find((topping) => topping.id === id))
      }
      const toppingTotal = toppingRows.reduce((sum, topping) => sum + topping.price, 0)
      const unitPrice = menuItem.price + (level ? (level - 1) * levelPriceStep : 0) + toppingTotal
      const note = typeof options.note === 'string' ? options.note.trim().slice(0, 250) : ''
      orderItems.push({ menuItem, qty, level, variant, note, toppings: toppingRows, unitPrice, lineTotal: unitPrice * qty })
    }

    const subtotal = orderItems.reduce((sum, item) => sum + item.lineTotal, 0)
    const total = subtotal + fee
    const orderCode = `MB-${randomUUID().replaceAll('-', '').slice(0, 20).toUpperCase()}`
    const [result] = await connection.execute(
      `INSERT INTO orders (order_code, idempotency_key, table_number, customer_name, customer_phone, payment_method,
          source, created_by_staff_id, status, subtotal, fee, total, paid_at, paid_method, paid_by_staff_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'menunggu', ?, ?, ?, IF(? IS NULL, NULL, CURRENT_TIMESTAMP), ?, ?)`,
      [orderCode, idempotencyKey, tableNumber, name, phone || null, paymentMethod,
        staffId ? 'kasir' : 'pelanggan', staffId, subtotal, fee, total,
        paidMethod, paidMethod, paidMethod ? staffId : null]
    )

    for (const item of orderItems) {
      await connection.execute(
        `INSERT INTO order_items
          (order_id, menu_item_id, item_name, qty, level_value, variant, note, toppings_snapshot, unit_price, line_total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [result.insertId, item.menuItem.id, item.menuItem.name, item.qty, item.level, item.variant, item.note,
          JSON.stringify(item.toppings.map(({ id, name, price }) => ({ id, name, price }))), item.unitPrice, item.lineTotal]
      )
    }

    const response = {
      id: orderCode,
      status: 'menunggu',
      tableNumber,
      paymentMethod,
      paid: paidMethod !== null,
      items: orderItems.map((item) => ({
        itemId: item.menuItem.id,
        name: item.menuItem.name,
        qty: item.qty,
        unitPrice: item.unitPrice,
        lineTotal: item.lineTotal,
        toppingDetails: item.toppings,
        options: {
          level: item.level,
          variant: item.variant,
          toppings: item.toppings.map((topping) => topping.id),
          note: item.note,
        },
      })),
      subtotal,
      fee,
      total,
      createdAt: new Date().toISOString(),
    }
    await connection.commit()
    return { order: response, created: true }
  } catch (error) {
    await connection.rollback()
    // Dua request dengan key yang sama bisa lolos pengecekan awal bersamaan; yang kalah kena UNIQUE.
    if (idempotencyKey && error.code === 'ER_DUP_ENTRY') {
      const existingCode = await findOrderCodeByIdempotencyKey(pool, idempotencyKey)
      if (existingCode) return { order: await readOrder(pool, existingCode), created: false }
    }
    throw error
  } finally {
    connection.release()
  }
}

export async function getOrder(orderCode) {
  return readOrder(pool, orderCode)
}
