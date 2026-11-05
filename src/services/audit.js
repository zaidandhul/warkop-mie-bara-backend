import { pool } from '../db.js'

// Catat satu perubahan oleh staf. Panggil di dalam transaksi yang sama dengan perubahannya.
export async function recordAudit(connection, { staffId, action, entityId, oldValue = null, newValue = null }) {
  await connection.execute(
    'INSERT INTO staff_audit_log (staff_id, action, entity_id, old_value, new_value) VALUES (?, ?, ?, ?, ?)',
    [staffId ?? null, action, String(entityId), oldValue == null ? null : String(oldValue), newValue == null ? null : String(newValue)]
  )
}

const ENTRY_COLUMNS = `a.action, a.entity_id AS entityId, a.old_value AS oldValue, a.new_value AS newValue,
  s.username AS staff, a.created_at AS at`

// Riwayat perubahan status dan pembayaran untuk daftar order_code -> Map(order_code -> entri[]).
export async function orderHistory(orderCodes) {
  const history = new Map(orderCodes.map((code) => [code, []]))
  if (!orderCodes.length) return history
  const [rows] = await pool.execute(
    `SELECT ${ENTRY_COLUMNS} FROM staff_audit_log a LEFT JOIN staff_users s ON s.id = a.staff_id
      WHERE a.action IN ('order_status', 'order_payment') AND a.entity_id IN (${orderCodes.map(() => '?').join(',')})
      ORDER BY a.created_at, a.id`, orderCodes
  )
  for (const { entityId, ...entry } of rows) history.get(entityId)?.push(entry)
  return history
}

// Entri terbaru (semua aksi), untuk peninjauan admin.
export async function recentAudit({ limit = 50 } = {}) {
  const size = Math.min(Math.max(Number.parseInt(limit, 10) || 50, 1), 200)
  const [rows] = await pool.query(
    `SELECT ${ENTRY_COLUMNS} FROM staff_audit_log a LEFT JOIN staff_users s ON s.id = a.staff_id
      ORDER BY a.created_at DESC, a.id DESC LIMIT ${size}`
  )
  return rows
}
