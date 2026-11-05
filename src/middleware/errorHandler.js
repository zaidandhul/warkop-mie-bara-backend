import { serializeError } from '../logger.js'

// Error handler terakhir: JSON tidak valid -> 400, error ber-statusCode -> {error} dengan status itu,
// selain itu -> 500 dengan pesan generik ke klien dan stack lengkap di log server.
export function errorHandler(logger) {
  return (error, req, res, _next) => {
    if (error instanceof SyntaxError && 'body' in error) {
      return res.status(400).json({ error: 'Format JSON tidak valid.' })
    }
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message })
    logger.error({ err: serializeError(error), method: req.method, path: (req.originalUrl ?? '').split('?')[0] }, 'unhandled error')
    res.status(500).json({ error: 'Terjadi kesalahan pada server.' })
  }
}
