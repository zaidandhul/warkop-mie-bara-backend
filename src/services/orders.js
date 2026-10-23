import { randomUUID } from 'node:crypto'
import { pool } from '../db.js'
import { jsonArray } from '../utils/json.js'

function invalid(message) {
  return Object.assign(new Error(message), { statusCode: 400 })
}

async function readOrder(connection, orderCode) {
  const [orders] = await connection.execute(
    `SELECT order_code AS id, status, table_number AS tableNumber,
            payment_method AS paymentMethod, subtotal, fee, total, created_at AS createdAt
       FROM orders WHERE order_code = ?`, [orderCode]
  )
  if (!orders.length) return null
  const order = orders[0]
  const [items] = await connection.execute(
    `SELECT menu_item_id AS itemId, item_name AS name, qty, unit_price AS unitPrice,
            line_total AS lineTotal, level_value AS level, variant, note, toppings_snapshot AS toppings
       FROM order_items WHERE order_id = (SELECT id FROM orders WHERE order_code = ?) ORDER BY id`, [orderCode]
  )
  order.items = items.map((item) => {
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
  })
  return order
}

export async function createOrder(payload) {
  if (!payload || !Array.isArray(payload.items) || payload.items.length === 0) {
    throw invalid('Pesanan harus berisi minimal satu item.')
  }
  if (payload.items.length > 50) throw invalid('Pesanan terlalu banyak item.')

  const parsedTableNumber = Number(payload.tableNumber)
  if (!Number.isInteger(parsedTableNumber) || parsedTableNumber < 1 || parsedTableNumber > 20) {
    throw invalid('Pilih nomor meja dari 1 sampai 20.')
  }
  const tableNumber = String(parsedTableNumber)
  const customer = payload.customer && typeof payload.customer === 'object' ? payload.customer : {}
  const name = typeof customer.name === 'string' ? customer.name.trim() : ''
  if (!name || name.length > 100) throw invalid('Nama pemesan wajib diisi (maksimal 100 karakter).')
  const phone = typeof customer.phone === 'string' ? customer.phone.trim().slice(0, 30) : ''
  const paymentMethod = payload.paymentMethod
  if (!['online', 'cashier'].includes(paymentMethod)) throw invalid('Metode pembayaran tidak valid.')

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
      const qty = Number(input.qty)
      if (!Number.isInteger(qty) || qty < 1 || qty > 50) throw invalid('Jumlah item harus 1 sampai 50.')
      const [rows] = await connection.execute(
        `SELECT id, name, price, levels_json, options_json, allowed_toppings_json
           FROM menu_items WHERE id = ? AND is_active = 1 FOR UPDATE`, [input.itemId]
      )
      const menuItem = rows[0]
      if (!menuItem) throw invalid(`Menu ${input.itemId} tidak ditemukan atau tidak tersedia.`)

      const levels = jsonArray(menuItem.levels_json)
      const variants = jsonArray(menuItem.options_json)
      const allowedToppings = jsonArray(menuItem.allowed_toppings_json)

      const options = input.options && typeof input.options === 'object' ? input.options : {}
      const level = options.level == null ? null : Number(options.level)
      if (level !== null && !levels.includes(level)) throw invalid(`Level untuk ${menuItem.name} tidak valid.`)
      const variant = options.variant == null ? null : String(options.variant)
      if (variant !== null && !variants.includes(variant)) throw invalid(`Pilihan untuk ${menuItem.name} tidak valid.`)

      const selectedToppings = options.toppings ?? []
      if (!Array.isArray(selectedToppings) || new Set(selectedToppings).size !== selectedToppings.length) {
        throw invalid('Daftar topping tidak valid.')
      }
      if (selectedToppings.some((id) => typeof id !== 'string' || !allowedToppings.includes(id))) {
        throw invalid(`Topping untuk ${menuItem.name} tidak valid.`)
      }

      let toppingRows = []
      if (selectedToppings.length) {
        const placeholders = selectedToppings.map(() => '?').join(',')
        const [found] = await connection.execute(
          `SELECT id, name, price FROM toppings WHERE is_active = 1 AND id IN (${placeholders})`, selectedToppings
        )
        if (found.length !== selectedToppings.length) throw invalid('Ada topping yang tidak tersedia.')
        toppingRows = found
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
      `INSERT INTO orders (order_code, table_number, customer_name, customer_phone, payment_method, status, subtotal, fee, total)
       VALUES (?, ?, ?, ?, ?, 'menunggu', ?, ?, ?)`,
      [orderCode, tableNumber, name, phone || null, paymentMethod, subtotal, fee, total]
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
    return response
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

export async function getOrder(orderCode) {
  return readOrder(pool, orderCode)
}
