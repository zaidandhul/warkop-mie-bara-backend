import { pool } from '../db.js'
import { jsonArray } from '../utils/json.js'
import { TABLE_COUNT } from '../utils/validation.js'

const BEST_SELLER_DAYS = 30

// Peringkat terlaris (1 = paling banyak terjual) dari pesanan BEST_SELLER_DAYS hari terakhir yang tidak
// dibatalkan, hanya untuk item di daftar `items` (menu aktif, sudah dalam urutan default). Seri
// diputuskan oleh urutan default. Jumlah terjual sengaja tidak dikembalikan (API publik).
async function bestSellerRanks(items) {
  const since = new Date(Date.now() - BEST_SELLER_DAYS * 24 * 60 * 60 * 1000)
  const [rows] = await pool.execute(
    `SELECT oi.menu_item_id AS itemId, SUM(oi.qty) AS sold
       FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE o.status <> 'dibatalkan' AND o.created_at >= ? AND oi.menu_item_id IS NOT NULL
      GROUP BY oi.menu_item_id`, [since]
  )
  return rankBestSellers(items, new Map(rows.map((row) => [row.itemId, Number(row.sold)])))
}

// items (urutan default) + Map(id -> jumlah terjual) -> Map(id -> peringkat 1..n). Item tanpa penjualan
// tidak diberi peringkat; seri diputuskan oleh urutan default.
export function rankBestSellers(items, sold) {
  const ranked = items
    .map((item, index) => ({ id: item.id, index, sold: sold.get(item.id) ?? 0 }))
    .filter((entry) => entry.sold > 0)
    .sort((a, b) => b.sold - a.sold || a.index - b.index)
  return new Map(ranked.map((entry, position) => [entry.id, position + 1]))
}

export async function getMenu() {
  const [categories] = await pool.execute('SELECT id, name FROM categories ORDER BY sort_order, name')
  const [items] = await pool.execute(
    `SELECT id, category_id, name, description, price, best_seller, cold,
            needs_price_check, levels_json, options_json, allowed_toppings_json
       FROM menu_items WHERE is_active = 1 ORDER BY sort_order, name`
  )
  const [toppings] = await pool.execute('SELECT id, name, price FROM toppings WHERE is_active = 1 ORDER BY name')
  const [settings] = await pool.execute("SELECT setting_key, setting_value FROM app_settings WHERE setting_key IN ('other_fee', 'level_price_step')")
  const settingMap = Object.fromEntries(settings.map((row) => [row.setting_key, Number(row.setting_value)]))
  const ranks = await bestSellerRanks(items)

  return {
    categories: categories.map((category) => ({
      ...category,
      items: items.filter((item) => item.category_id === category.id).map((item) => ({
        id: item.id,
        categoryId: item.category_id,
        name: item.name,
        desc: item.description,
        price: item.price,
        bestSeller: Boolean(item.best_seller),
        cold: Boolean(item.cold),
        check: Boolean(item.needs_price_check),
        levels: jsonArray(item.levels_json),
        options: jsonArray(item.options_json),
        toppings: jsonArray(item.allowed_toppings_json),
        bestSellerRank: ranks.get(item.id) ?? null,
      })),
    })).filter((category) => category.items.length),
    toppings,
    fee: settingMap.other_fee ?? 0,
    levelPriceStep: settingMap.level_price_step ?? 0,
    tableCount: TABLE_COUNT,
  }
}
