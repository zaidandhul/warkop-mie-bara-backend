// Pemeriksaan konfigurasi saat NODE_ENV=production. Mode dev/test tidak diperiksa di sini (JWT_SECRET
// tetap wajib di semua mode, lihat jwtSecret() di services/auth.js).
const MIN_SECRET_LENGTH = 32
// Pola nilai contoh/placeholder. Hanya kata panjang (>= 4 huruf) supaya rahasia acak base64 tidak
// kebetulan cocok.
const PLACEHOLDER = /(ganti|change|contoh|example|sample|placeholder|rahasia|secret|password|todo)/i

// Mengembalikan daftar masalah (kosong = aman). Nilai rahasia tidak pernah disertakan di pesan.
export function productionEnvProblems(env) {
  const problems = []
  const secret = env.JWT_SECRET ?? ''
  if (!secret) problems.push('JWT_SECRET kosong.')
  else if (secret.length < MIN_SECRET_LENGTH) problems.push(`JWT_SECRET kurang dari ${MIN_SECRET_LENGTH} karakter.`)
  else if (PLACEHOLDER.test(secret) || /^(.)\1+$/.test(secret)) problems.push('JWT_SECRET terlihat seperti nilai contoh; buat yang acak.')

  const user = (env.MYSQL_USER ?? '').trim()
  if (!user) problems.push('MYSQL_USER kosong.')
  else if (user.toLowerCase() === 'root') problems.push('MYSQL_USER tidak boleh root; buat user MySQL khusus aplikasi.')
  if (!env.MYSQL_PASSWORD) problems.push('MYSQL_PASSWORD kosong.')
  return problems
}

// Dipanggil saat start: di produksi, hentikan proses bila konfigurasi tidak aman.
export function assertProductionEnv(env = process.env, { log = console.error, exit = process.exit } = {}) {
  if (env.NODE_ENV !== 'production') return
  const problems = productionEnvProblems(env)
  if (!problems.length) return
  log(`Konfigurasi produksi tidak aman, server tidak dijalankan:\n- ${problems.join('\n- ')}`)
  exit(1)
}
