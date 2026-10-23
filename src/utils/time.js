// Zona bisnis Asia/Jakarta (WIB). Indonesia tidak memakai DST, jadi offset tetap +07:00.
// Tabel zona waktu MySQL kosong, jadi CONVERT_TZ('Asia/Jakarta') tidak bisa dipakai.
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000

export function todayWib(now = new Date()) {
  return new Date(now.getTime() + WIB_OFFSET_MS).toISOString().slice(0, 10)
}

// 'YYYY-MM-DD' (tanggal WIB) -> { start, end } sebagai Date UTC, rentang [start, end).
// Mengembalikan null jika format atau tanggalnya tidak valid.
export function wibDayRange(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const midnightUtc = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(midnightUtc.getTime()) || midnightUtc.toISOString().slice(0, 10) !== date) return null
  const start = new Date(midnightUtc.getTime() - WIB_OFFSET_MS)
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) }
}
