// Batas percobaan login gagal per kunci (IP|username), disimpan di memori: hilang saat server restart.
// - Entri kedaluwarsa dibersihkan oleh sweep() (dipanggil berkala) dan saat dicek.
// - Ukuran Map dibatasi maxEntries: bila penuh, entri kedaluwarsa disapu dulu, lalu entri tertua dibuang.
//   Penyerang yang membanjiri ribuan username paling buruk hanya membuat lockout lama terlupa, bukan
//   menghabiskan memori server.
export function createLoginLimiter({ maxAttempts = 5, windowMs = 15 * 60 * 1000, maxEntries = 10_000, now = Date.now } = {}) {
  const attempts = new Map() // key -> { count, firstAt }
  const expired = (entry) => now() - entry.firstAt > windowMs

  function sweep() {
    for (const [key, entry] of attempts) if (expired(entry)) attempts.delete(key)
  }

  return {
    // null jika boleh mencoba, atau { minutesLeft } jika sedang dikunci.
    check(key) {
      const entry = attempts.get(key)
      if (!entry) return null
      if (expired(entry)) {
        attempts.delete(key)
        return null
      }
      if (entry.count < maxAttempts) return null
      return { minutesLeft: Math.ceil((entry.firstAt + windowMs - now()) / 60000) }
    },
    recordFailure(key) {
      const entry = attempts.get(key)
      if (entry && !expired(entry)) {
        entry.count += 1
        return
      }
      attempts.delete(key)
      if (attempts.size >= maxEntries) sweep()
      if (attempts.size >= maxEntries) attempts.delete(attempts.keys().next().value) // tertua (urutan sisip)
      attempts.set(key, { count: 1, firstAt: now() })
    },
    reset(key) {
      attempts.delete(key)
    },
    sweep,
    get size() {
      return attempts.size
    },
  }
}
