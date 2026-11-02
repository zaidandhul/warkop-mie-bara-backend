import { pool } from '../db.js'
import { todayWib, wibDateHour, wibDayRange } from '../utils/time.js'

const MAX_RANGE_DAYS = 92

function fail(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode })
}

function addTo(map, key, order) {
  const entry = map.get(key) ?? { orders: 0, revenue: 0 }
  entry.orders += 1
  entry.revenue += order.total
  map.set(key, entry)
}

// Laporan penjualan untuk tanggal WIB from..to (inklusif). Omzet = total pesanan yang tidak dibatalkan
// (lunas maupun belum); rincian lunas/belum dan per metode bayar ada di summary.
export async function salesReport({ from, to } = {}) {
  const fromDay = from || todayWib()
  const toDay = to || fromDay
  const fromRange = wibDayRange(fromDay)
  const toRange = wibDayRange(toDay)
  if (!fromRange || !toRange) throw fail('Tanggal tidak valid. Gunakan format YYYY-MM-DD.')
  if (fromRange.start > toRange.start) throw fail('Tanggal awal harus sebelum atau sama dengan tanggal akhir.')
  const days = Math.round((toRange.end - fromRange.start) / 86_400_000)
  if (days > MAX_RANGE_DAYS) throw fail(`Rentang laporan maksimal ${MAX_RANGE_DAYS} hari.`)

  const [orders] = await pool.execute(
    `SELECT id, order_code AS id_code, created_at AS createdAt, table_number AS tableNumber,
            customer_name AS customerName, source, status, paid_at AS paidAt, paid_method AS paidMethod,
            subtotal, fee, total
       FROM orders WHERE created_at >= ? AND created_at < ? ORDER BY created_at, id`,
    [fromRange.start, toRange.end]
  )
  const [items] = await pool.execute(
    `SELECT oi.order_id AS orderId, oi.menu_item_id AS itemId, oi.item_name AS name, oi.qty, oi.line_total AS lineTotal
       FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE o.created_at >= ? AND o.created_at < ? ORDER BY oi.id`,
    [fromRange.start, toRange.end]
  )

  const itemsByOrder = new Map()
  for (const item of items) {
    if (!itemsByOrder.has(item.orderId)) itemsByOrder.set(item.orderId, [])
    itemsByOrder.get(item.orderId).push(item)
  }

  const summary = {
    orders: 0, cancelledOrders: 0, revenue: 0, paidRevenue: 0, unpaidRevenue: 0, itemsSold: 0,
    byPaidMethod: { tunai: 0, qris_manual: 0 },
  }
  const byDay = new Map()
  const byTable = new Map()
  const byHour = new Map()
  const topItems = new Map()

  for (const order of orders) {
    if (order.status === 'dibatalkan') {
      summary.cancelledOrders += 1
      continue
    }
    const { date, hour } = wibDateHour(order.createdAt)
    summary.orders += 1
    summary.revenue += order.total
    if (order.paidAt) {
      summary.paidRevenue += order.total
      summary.byPaidMethod[order.paidMethod] += order.total
    } else {
      summary.unpaidRevenue += order.total
    }
    addTo(byDay, date, order)
    addTo(byTable, order.tableNumber, order)
    addTo(byHour, hour, order)
    for (const item of itemsByOrder.get(order.id) ?? []) {
      summary.itemsSold += item.qty
      // Dikelompokkan per menu; nama dari snapshot pesanan (menu yang sudah dihapus tetap terhitung).
      const key = item.itemId ?? `nama:${item.name}`
      const entry = topItems.get(key) ?? { itemId: item.itemId, name: item.name, qty: 0, revenue: 0 }
      entry.qty += item.qty
      entry.revenue += item.lineTotal
      topItems.set(key, entry)
    }
  }
  summary.averageOrder = summary.orders ? Math.round(summary.revenue / summary.orders) : 0

  return {
    from: fromDay,
    to: toDay,
    summary,
    byDay: [...byDay].map(([date, entry]) => ({ date, ...entry })),
    byTable: [...byTable].map(([table, entry]) => ({ table, ...entry }))
      .sort((a, b) => Number(a.table) - Number(b.table) || a.table.localeCompare(b.table)),
    byHour: [...byHour].map(([hour, entry]) => ({ hour, ...entry })).sort((a, b) => a.hour - b.hour),
    topItems: [...topItems.values()].sort((a, b) => b.qty - a.qty || b.revenue - a.revenue),
    orders: orders.map(({ id, id_code: code, ...order }) => ({
      id: code,
      ...order,
      items: (itemsByOrder.get(id) ?? []).map(({ name, qty }) => ({ name, qty })),
    })),
  }
}
