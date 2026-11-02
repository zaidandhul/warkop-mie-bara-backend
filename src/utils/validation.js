// Jumlah meja di warung (meja 1..TABLE_COUNT). Dikirim ke frontend lewat GET /api/menu (tableCount).
export const TABLE_COUNT = Math.min(Math.max(Number.parseInt(process.env.TABLE_COUNT ?? '10', 10) || 10, 1), 99)

// Nomor meja: trim, hanya angka, nol di depan dibuang ("09" -> "9"), 1–TABLE_COUNT.
// Mengembalikan string ternormalisasi atau null jika tidak valid.
export function normalizeTableNumber(value) {
  const text = String(value ?? '').trim()
  if (!/^\d{1,4}$/.test(text)) return null
  const number = Number(text)
  return number >= 1 && number <= TABLE_COUNT ? String(number) : null
}

// No. HP Indonesia: buang spasi/tanda baca, +62/62 -> 0, lalu harus 08xx dengan total 10–13 digit.
// Mengembalikan '' untuk input kosong, string ternormalisasi, atau null jika tidak valid.
export function normalizePhone(value) {
  let phone = String(value ?? '').replace(/[\s\-().]/g, '')
  if (!phone) return ''
  if (phone.startsWith('+62')) phone = '0' + phone.slice(3)
  else if (phone.startsWith('62')) phone = '0' + phone.slice(2)
  return /^08\d{8,11}$/.test(phone) ? phone : null
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}
