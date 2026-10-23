import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { pool } from '../db.js'

export const STAFF_COOKIE = 'mb_staff'
const SESSION_HOURS = 12
const BCRYPT_ROUNDS = 12
const MAX_FAILED_ATTEMPTS = 5
const LOCKOUT_MS = 15 * 60 * 1000
// Hash asal untuk username yang tidak ada, supaya waktu respons sama dengan password salah.
const DUMMY_HASH = bcrypt.hashSync('bukan-password-siapa-pun', BCRYPT_ROUNDS)

function authError(message, statusCode = 401) {
  return Object.assign(new Error(message), { statusCode })
}

export function jwtSecret() {
  const secret = process.env.JWT_SECRET
  if (!secret || secret.length < 32) throw new Error('JWT_SECRET wajib diisi di .env (minimal 32 karakter).')
  return secret
}

export function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS)
}

// Batas percobaan login gagal per IP+username, disimpan di memori (hilang saat server restart).
const failedAttempts = new Map()

function attemptKey(ip, username) {
  return `${ip}|${username.toLowerCase()}`
}

function checkLockout(key) {
  const entry = failedAttempts.get(key)
  if (!entry) return
  if (Date.now() - entry.firstAt > LOCKOUT_MS) {
    failedAttempts.delete(key)
    return
  }
  if (entry.count >= MAX_FAILED_ATTEMPTS) {
    const minutes = Math.ceil((entry.firstAt + LOCKOUT_MS - Date.now()) / 60000)
    throw authError(`Terlalu banyak percobaan login. Coba lagi dalam ${minutes} menit.`, 429)
  }
}

function recordFailure(key) {
  const entry = failedAttempts.get(key)
  if (entry && Date.now() - entry.firstAt <= LOCKOUT_MS) entry.count += 1
  else failedAttempts.set(key, { count: 1, firstAt: Date.now() })
}

export async function login({ username, password }, ip) {
  if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password) {
    throw authError('Username dan password wajib diisi.', 400)
  }
  const cleanUsername = username.trim()
  const key = attemptKey(ip, cleanUsername)
  checkLockout(key)

  const [rows] = await pool.execute(
    'SELECT id, username, password_hash, is_active FROM staff_users WHERE username = ?', [cleanUsername]
  )
  const staff = rows[0]
  const valid = await bcrypt.compare(password, staff?.password_hash ?? DUMMY_HASH)
  if (!staff || !valid || !staff.is_active) {
    recordFailure(key)
    throw authError('Username atau password salah.')
  }
  failedAttempts.delete(key)
  await pool.execute('UPDATE staff_users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?', [staff.id])

  const token = jwt.sign({ sub: String(staff.id) }, jwtSecret(), { expiresIn: `${SESSION_HOURS}h` })
  return { token, maxAgeMs: SESSION_HOURS * 60 * 60 * 1000, staff: publicStaff(staff) }
}

// Token -> staf aktif. Status aktif selalu dibaca ulang dari database, jadi menonaktifkan
// akun langsung berlaku tanpa menunggu token kedaluwarsa. Semua staf adalah admin (tanpa role).
export async function staffFromToken(token) {
  if (!token) throw authError('Silakan login terlebih dahulu.')
  let payload
  try {
    payload = jwt.verify(token, jwtSecret())
  } catch {
    throw authError('Sesi berakhir. Silakan login kembali.')
  }
  const [rows] = await pool.execute(
    'SELECT id, username, is_active FROM staff_users WHERE id = ?', [Number(payload.sub)]
  )
  const staff = rows[0]
  if (!staff || !staff.is_active) throw authError('Akun tidak aktif. Silakan login kembali.')
  return publicStaff(staff)
}

function publicStaff(staff) {
  return { id: staff.id, username: staff.username }
}
