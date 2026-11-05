import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { pool } from '../db.js'
import { createLoginLimiter } from './loginLimiter.js'

export const STAFF_COOKIE = 'mb_staff'
const SESSION_HOURS = 12
const BCRYPT_ROUNDS = 12
const MAX_FAILED_ATTEMPTS = 5
const LOCKOUT_MS = 15 * 60 * 1000
const JWT_ALGORITHM = 'HS256'
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

export function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash)
}

// Token sesi: sub = id staf, v = session_version saat login. Mengganti/me-reset password menaikkan
// session_version, sehingga token lama ditolak oleh staffFromToken.
export function issueToken(staff) {
  const token = jwt.sign(
    { sub: String(staff.id), v: Number(staff.session_version ?? staff.sessionVersion ?? 0) },
    jwtSecret(), { algorithm: JWT_ALGORITHM, expiresIn: `${SESSION_HOURS}h` }
  )
  return { token, maxAgeMs: SESSION_HOURS * 60 * 60 * 1000 }
}

// Batas percobaan login gagal per IP+username, di memori (lihat loginLimiter.js). Entri kedaluwarsa
// disapu tiap menit; unref() supaya timer ini tidak menahan proses tetap hidup.
const loginLimiter = createLoginLimiter({ maxAttempts: MAX_FAILED_ATTEMPTS, windowMs: LOCKOUT_MS })
setInterval(() => loginLimiter.sweep(), 60_000).unref()

function attemptKey(ip, username) {
  return `${ip}|${username.toLowerCase()}`
}

export async function login({ username, password }, ip) {
  if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password) {
    throw authError('Username dan password wajib diisi.', 400)
  }
  const cleanUsername = username.trim()
  const key = attemptKey(ip, cleanUsername)
  const lockout = loginLimiter.check(key)
  if (lockout) throw authError(`Terlalu banyak percobaan login. Coba lagi dalam ${lockout.minutesLeft} menit.`, 429)

  const [rows] = await pool.execute(
    'SELECT id, username, password_hash, is_admin, is_active, session_version FROM staff_users WHERE username = ?', [cleanUsername]
  )
  const staff = rows[0]
  const valid = await bcrypt.compare(password, staff?.password_hash ?? DUMMY_HASH)
  if (!staff || !valid || !staff.is_active) {
    loginLimiter.recordFailure(key)
    throw authError('Username atau password salah.')
  }
  loginLimiter.reset(key)
  await pool.execute('UPDATE staff_users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?', [staff.id])

  return { ...issueToken(staff), staff: publicStaff(staff) }
}

// Payload token yang sah, atau error 401. Algoritma dikunci ke HS256: token dengan algoritma lain
// (termasuk "none") ditolak walau ditandatangani dengan rahasia yang sama.
export function verifyStaffToken(token) {
  if (!token) throw authError('Silakan login terlebih dahulu.')
  try {
    return jwt.verify(token, jwtSecret(), { algorithms: [JWT_ALGORITHM] })
  } catch {
    throw authError('Sesi berakhir. Silakan login kembali.')
  }
}

// Token -> staf aktif. Status aktif, peran, dan versi sesi selalu dibaca ulang dari database, jadi
// menonaktifkan akun atau mengganti password langsung berlaku tanpa menunggu token kedaluwarsa.
// Token lama tanpa klaim v dianggap versi 0.
export async function staffFromToken(token) {
  const payload = verifyStaffToken(token)
  const [rows] = await pool.execute(
    'SELECT id, username, is_admin, is_active, session_version FROM staff_users WHERE id = ?', [Number(payload.sub)]
  )
  const staff = rows[0]
  if (!staff || !staff.is_active) throw authError('Akun tidak aktif. Silakan login kembali.')
  if (Number(payload.v ?? 0) !== Number(staff.session_version)) throw authError('Sesi berakhir karena password diganti. Silakan login kembali.')
  return publicStaff(staff)
}

// Data staf yang boleh dikirim ke klien. isAdmin hanya membatasi kelola akun staf.
function publicStaff(staff) {
  return { id: staff.id, username: staff.username, isAdmin: Boolean(staff.is_admin) }
}
