// Header keamanan untuk semua respons API (backend hanya mengirim JSON, jadi CSP paling ketat aman).
// CSP halaman aplikasi (HTML/JS dari frontend) diatur oleh server yang menyajikan frontend saat hosting.
export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
}

export function securityHeaders(_req, res, next) {
  res.set(SECURITY_HEADERS)
  next()
}
