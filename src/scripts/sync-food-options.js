import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { pool } from '../db.js'

const catalog = JSON.parse(await readFile(fileURLToPath(new URL('../data/menu.json', import.meta.url)), 'utf8'))
const supportedCategories = new Set(['special', 'bara-nusantara'])

try {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    let updated = 0
    for (const category of catalog.categories.filter((entry) => supportedCategories.has(entry.id))) {
      for (const item of category.items) {
        const [result] = await connection.execute(
          'UPDATE menu_items SET levels_json = ?, allowed_toppings_json = ? WHERE id = ?',
          [JSON.stringify(item.levels), JSON.stringify(item.toppings), item.id]
        )
        updated += result.affectedRows
      }
    }
    await connection.commit()
    console.log(`Opsi level pedas dan topping diperbarui untuk ${updated} menu makanan.`)
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
} finally {
  await pool.end()
}
