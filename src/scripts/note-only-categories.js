import { pool } from '../db.js'

try {
  const [result] = await pool.execute(
    `UPDATE menu_items
        SET levels_json = NULL, options_json = NULL, allowed_toppings_json = NULL
      WHERE category_id IN ('camilan', 'signature-drink', 'all-variant-drink')`
  )
  console.log(`Opsi selain catatan dinonaktifkan pada ${result.affectedRows} menu di tiga kategori minuman/camilan.`)
} finally {
  await pool.end()
}
