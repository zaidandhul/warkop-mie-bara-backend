import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { pool } from '../db.js'

const catalogUrl = new URL('../data/menu.json', import.meta.url)
const catalog = JSON.parse(await readFile(fileURLToPath(catalogUrl), 'utf8'))

try {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    for (const [categoryIndex, category] of catalog.categories.entries()) {
      await connection.execute(
        `INSERT INTO categories (id, name, sort_order) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE name = VALUES(name), sort_order = VALUES(sort_order)`,
        [category.id, category.name, categoryIndex]
      )
    }
    for (const topping of catalog.toppings) {
      await connection.execute(
        `INSERT INTO toppings (id, name, price, is_active) VALUES (?, ?, ?, TRUE)
         ON DUPLICATE KEY UPDATE name = VALUES(name), price = VALUES(price), is_active = TRUE`,
        [topping.id, topping.name, topping.price]
      )
    }
    for (const [categoryIndex, category] of catalog.categories.entries()) {
      for (const [itemIndex, item] of category.items.entries()) {
        await connection.execute(
          `INSERT INTO menu_items
            (id, category_id, name, description, price, best_seller, cold, needs_price_check,
             levels_json, options_json, allowed_toppings_json, is_active, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, ?)
           ON DUPLICATE KEY UPDATE category_id = VALUES(category_id), name = VALUES(name),
             description = VALUES(description), price = VALUES(price), best_seller = VALUES(best_seller),
             cold = VALUES(cold), needs_price_check = VALUES(needs_price_check),
             levels_json = VALUES(levels_json), options_json = VALUES(options_json),
             allowed_toppings_json = VALUES(allowed_toppings_json), is_active = TRUE, sort_order = VALUES(sort_order)`,
          [item.id, category.id, item.name, item.desc ?? null, item.price, Boolean(item.bestSeller), Boolean(item.cold),
            Boolean(item.check), item.levels ? JSON.stringify(item.levels) : null,
            item.options ? JSON.stringify(item.options) : null,
            item.toppings ? JSON.stringify(item.toppings) : null, categoryIndex * 100 + itemIndex]
        )
      }
    }
    for (const [key, value] of [['other_fee', catalog.otherFee ?? 0], ['level_price_step', catalog.levelPriceStep ?? 0]]) {
      await connection.execute(
        `INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`, [key, value]
      )
    }
    await connection.commit()
    console.log('Katalog menu dan pengaturan berhasil dimasukkan ke MySQL.')
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
} finally {
  await pool.end()
}
