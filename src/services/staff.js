import { pool, withTransaction } from '../db.js'
import { hashPassword, verifyPassword } from './auth.js'

export const MIN_PASSWORD_LENGTH = 8
// bcrypt hanya memakai 72 byte pertama; password lebih panjang ditolak agar tidak terpotong diam-diam.
export const MAX_PASSWORD_BYTES = 72
export const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{3,50}$/

function fail(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode })
}

// Pesan error (string) atau null jika valid.
export function usernameProblem(username) {
  if (typeof username !== 'string' || !USERNAME_PATTERN.test(username)) {
    return 'Username harus 3–50 karakter: huruf, angka, titik, garis bawah, atau tanda minus.'
  }
  return null
}

export function passwordProblem(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) return `Password minimal ${MIN_PASSWORD_LENGTH} karakter.`
  if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) return `Password maksimal ${MAX_PASSWORD_BYTES} byte.`
  return null
}

// Aturan perubahan akun: tidak boleh menonaktifkan/menurunkan diri sendiri, dan harus tersisa minimal
// satu admin aktif. Mengembalikan pesan error atau null.
export function staffChangeProblem({ actorId, target, changes, activeAdmins }) {
  const deactivating = changes.isActive === false && target.isActive
  const demoting = changes.isAdmin === false && target.isAdmin
  if ((deactivating || demoting) && target.id === actorId) return 'Tidak bisa menonaktifkan atau menurunkan akun sendiri.'
  if ((deactivating || demoting) && target.isAdmin && target.isActive && activeAdmins <= 1) {
    return 'Harus tersisa minimal satu admin aktif.'
  }
  return null
}

const STAFF_COLUMNS = `id, username, is_admin AS isAdmin, is_active AS isActive, last_login_at AS lastLoginAt, created_at AS createdAt`
const toStaff = (row) => ({ ...row, isAdmin: Boolean(row.isAdmin), isActive: Boolean(row.isActive) })

export async function listStaff() {
  const [rows] = await pool.execute(`SELECT ${STAFF_COLUMNS} FROM staff_users ORDER BY username`)
  return rows.map(toStaff)
}

export async function createStaff({ username, password, isAdmin = false } = {}) {
  const problem = usernameProblem(username) ?? passwordProblem(password)
  if (problem) throw fail(problem)
  if (typeof isAdmin !== 'boolean') throw fail('isAdmin harus true atau false.')
  try {
    const [result] = await pool.execute(
      'INSERT INTO staff_users (username, password_hash, is_admin) VALUES (?, ?, ?)', [username, await hashPassword(password), isAdmin]
    )
    const [rows] = await pool.execute(`SELECT ${STAFF_COLUMNS} FROM staff_users WHERE id = ?`, [result.insertId])
    return toStaff(rows[0])
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') throw fail(`Username "${username}" sudah dipakai.`, 409)
    throw error
  }
}

export async function updateStaff(id, changes, actorId) {
  const body = changes && typeof changes === 'object' ? changes : {}
  for (const key of ['isActive', 'isAdmin']) {
    if (key in body && typeof body[key] !== 'boolean') throw fail(`${key} harus true atau false.`)
  }
  if (!('isActive' in body) && !('isAdmin' in body)) throw fail('Tidak ada perubahan. Kirim isActive dan/atau isAdmin.')
  return withTransaction(async (connection) => {
    // Kunci semua baris admin aktif: dua admin yang saling menonaktifkan bersamaan tidak bisa menghabiskan admin.
    const [admins] = await connection.execute('SELECT id FROM staff_users WHERE is_admin = 1 AND is_active = 1 FOR UPDATE')
    const [rows] = await connection.execute(`SELECT ${STAFF_COLUMNS} FROM staff_users WHERE id = ? FOR UPDATE`, [Number(id)])
    if (!rows.length) throw fail('Staf tidak ditemukan.', 404)
    const target = toStaff(rows[0])
    const problem = staffChangeProblem({ actorId, target, changes: body, activeAdmins: admins.length })
    if (problem) throw fail(problem)
    const sets = []
    const params = []
    if ('isActive' in body) { sets.push('is_active = ?'); params.push(body.isActive) }
    if ('isAdmin' in body) { sets.push('is_admin = ?'); params.push(body.isAdmin) }
    await connection.execute(`UPDATE staff_users SET ${sets.join(', ')} WHERE id = ?`, [...params, target.id])
    const [updated] = await connection.execute(`SELECT ${STAFF_COLUMNS} FROM staff_users WHERE id = ?`, [target.id])
    return toStaff(updated[0])
  })
}

// Admin mengganti password staf lain (lupa password). Semua sesi staf itu berakhir.
export async function resetStaffPassword(id, password) {
  const problem = passwordProblem(password)
  if (problem) throw fail(problem)
  const [result] = await pool.execute(
    'UPDATE staff_users SET password_hash = ?, session_version = session_version + 1 WHERE id = ?', [await hashPassword(password), Number(id)]
  )
  if (!result.affectedRows) throw fail('Staf tidak ditemukan.', 404)
}

// Staf mengganti password sendiri (wajib password lama). Sesi lain berakhir; pemanggil memberi token baru.
export async function changeOwnPassword(staffId, { currentPassword, newPassword } = {}) {
  if (typeof currentPassword !== 'string' || !currentPassword) throw fail('Password lama wajib diisi.')
  const problem = passwordProblem(newPassword)
  if (problem) throw fail(problem)
  const [rows] = await pool.execute('SELECT password_hash FROM staff_users WHERE id = ?', [staffId])
  if (!rows.length || !(await verifyPassword(currentPassword, rows[0].password_hash))) throw fail('Password lama salah.')
  if (currentPassword === newPassword) throw fail('Password baru harus berbeda dari password lama.')
  await pool.execute(
    'UPDATE staff_users SET password_hash = ?, session_version = session_version + 1 WHERE id = ?', [await hashPassword(newPassword), staffId]
  )
}
