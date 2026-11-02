// Batas jumlah request per IP dalam jendela waktu tetap, disimpan di memori: hilang saat server
// restart dan tidak dibagi antar-proses (cukup untuk satu instance backend). req.ip mengikuti
// pengaturan 'trust proxy' di server.js. max <= 0 berarti tanpa batas.
export function rateLimit({ windowMs, max, message }) {
  if (!(max > 0)) return (_req, _res, next) => next()
  const hits = new Map() // ip -> { count, resetAt }
  setInterval(() => {
    const now = Date.now()
    for (const [ip, entry] of hits) if (entry.resetAt <= now) hits.delete(ip)
  }, windowMs).unref()

  return (req, res, next) => {
    const now = Date.now()
    let entry = hits.get(req.ip)
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs }
      hits.set(req.ip, entry)
    }
    entry.count += 1
    if (entry.count <= max) return next()
    const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000)
    res.set('Retry-After', String(retryAfterSeconds))
    res.status(429).json({ error: message(Math.ceil(retryAfterSeconds / 60)) })
  }
}
