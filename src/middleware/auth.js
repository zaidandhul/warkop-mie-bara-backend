import { STAFF_COOKIE, staffFromToken } from '../services/auth.js'

export function readCookie(req, name) {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const index = part.indexOf('=')
    if (index !== -1 && part.slice(0, index).trim() === name) {
      try {
        return decodeURIComponent(part.slice(index + 1).trim())
      } catch {
        return null
      }
    }
  }
  return null
}

export function cookieOptions(maxAgeMs) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
    path: '/api',
    ...(maxAgeMs ? { maxAge: maxAgeMs } : {}),
  }
}

// Memasang req.staff; 401 jika belum login, sesi kedaluwarsa, atau akun nonaktif.
export async function requireStaff(req, res, next) {
  try {
    req.staff = await staffFromToken(readCookie(req, STAFF_COOKIE))
    next()
  } catch (error) {
    if (error.statusCode) {
      res.clearCookie(STAFF_COOKIE, cookieOptions())
      return res.status(error.statusCode).json({ error: error.message })
    }
    next(error)
  }
}
