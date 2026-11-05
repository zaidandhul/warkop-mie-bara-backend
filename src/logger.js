import pino from 'pino'

// Logger JSON satu baris per kejadian (stdout). Level lewat LOG_LEVEL (default info).
// Jangan pernah mencatat body request, cookie, header Authorization, nomor HP, atau token.
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: undefined, // tanpa pid/hostname
  timestamp: pino.stdTimeFunctions.isoTime,
})

// Error -> field yang aman dicatat. Properti tambahan (mis. `sql` dari mysql2) sengaja dibuang
// karena bisa memuat data pelanggan.
export function serializeError(error) {
  return { type: error?.name, message: error?.message, code: error?.code, stack: error?.stack }
}
