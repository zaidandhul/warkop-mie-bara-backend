// Satu baris log per request setelah respons selesai: method, path (tanpa query string), status,
// durasi. Tidak mencatat body, header, cookie, IP, atau query (bisa memuat data pribadi).
export function requestLog(logger, { now = () => performance.now() } = {}) {
  return (req, res, next) => {
    const start = now()
    res.on('finish', () => {
      logger.info({
        method: req.method,
        path: (req.originalUrl ?? req.url ?? '').split('?')[0],
        status: res.statusCode,
        durationMs: Math.round((now() - start) * 10) / 10,
      }, 'request')
    })
    next()
  }
}
