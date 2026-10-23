import { pool } from '../db.js'
import { jsonArray } from '../utils/json.js'

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
      })),
    })).filter((category) => category.items.length),
    toppings,
    fee: settingMap.other_fee ?? 0,
    levelPriceStep: settingMap.level_price_step ?? 0,
  }
}
