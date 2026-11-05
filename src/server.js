import express from 'express'
import { createOrder, getOrder } from './services/orders.js'
import { getMenu } from './services/menu.js'
import { listMenu, listOrders, updateMenuItem, updateOrderPayment, updateOrderStatus } from './services/admin.js'
import { STAFF_COOKIE, jwtSecret, login } from './services/auth.js'
import { salesReport } from './services/reports.js'
import { cookieOptions, requireStaff } from './middleware/auth.js'
import { rateLimit } from './middleware/rateLimit.js'
import { securityHeaders } from './middleware/securityHeaders.js'
import { pool } from './db.js'
import { assertProductionEnv } from './config/env.js'

assertProductionEnv() // NODE_ENV=production: tolak start bila JWT_SECRET/MYSQL_* tidak aman.
jwtSecret() // Semua mode: gagal start lebih awal jika JWT_SECRET belum diisi.

const app = express()
app.disable('x-powered-by')
const port = Number(process.env.PORT || 3000)
const allowedOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:5173'

// req.ip (rate limit, lockout login) diambil dari X-Forwarded-For hanya jika request datang dari
// proxy tepercaya. Default 'loopback': proxy di mesin yang sama (Vite dev server, Nginx lokal).
// Isi TRUST_PROXY sesuai topologi produksi (lihat dokumentasi 'trust proxy' Express).
const trustProxy = process.env.TRUST_PROXY ?? 'loopback'
app.set('trust proxy', /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy === 'true' ? true : trustProxy === 'false' ? false : trustProxy)

// Mencegah banjir pesanan palsu dari satu perangkat. Batasnya longgar karena pelanggan di WiFi
// warung bisa berbagi satu IP publik (NAT) bila backend di VPS; spam ke satu meja sudah dibatasi
// MAX_ACTIVE_ORDERS_PER_TABLE di createOrder.
const orderRateLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: Number(process.env.ORDER_RATE_LIMIT ?? 100),
  message: (minutes) => `Terlalu banyak pesanan dari perangkat ini. Coba lagi dalam ${minutes} menit atau hubungi kasir.`,
})

app.use(securityHeaders)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', allowedOrigin)
  res.header('Access-Control-Allow-Credentials', 'true')
  res.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type, Idempotency-Key')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})
app.use(express.json({ limit: '32kb' }))

app.get('/api/health', async (_req, res, next) => {
  try {
    await pool.query('SELECT 1')
    // testMode dan testDatabase dipakai test E2E untuk memastikan tidak berjalan terhadap database
    // utama. Nama database hanya dikirim dalam mode uji.
    const databaseName = process.env.MYSQL_DATABASE ?? ''
    const testMode = /_test$/.test(databaseName)
    res.json({ status: 'ok', database: 'connected', ...(testMode ? { testMode: true, testDatabase: databaseName } : {}) })
  } catch (error) {
    next(error)
  }
})

app.get('/api/menu', async (_req, res, next) => {
  try {
    res.json(await getMenu())
  } catch (error) {
    next(error)
  }
})

app.post('/api/orders', orderRateLimit, async (req, res, next) => {
  try {
    const idempotencyKey = req.get('Idempotency-Key')?.trim() || null
    const { order, created } = await createOrder(req.body, { idempotencyKey })
    res.status(created ? 201 : 200).json(order)
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message })
    next(error)
  }
})

app.get('/api/orders/:id', async (req, res, next) => {
  try {
    const order = await getOrder(req.params.id)
    if (!order) return res.status(404).json({ error: 'Pesanan tidak ditemukan.' })
    res.json(order)
  } catch (error) {
    next(error)
  }
})

app.post('/api/auth/login', async (req, res) => {
  const { token, maxAgeMs, staff } = await login(req.body ?? {}, req.ip)
  res.cookie(STAFF_COOKIE, token, cookieOptions(maxAgeMs))
  res.json({ staff })
})

app.post('/api/auth/logout', (_req, res) => {
  res.clearCookie(STAFF_COOKIE, cookieOptions())
  res.status(204).end()
})

// Semua rute /api/admin wajib login staf. Express 5 meneruskan error dari handler async ke
// error handler di bawah, yang mengubah error ber-statusCode menjadi {error}.
const admin = express.Router()
admin.use(requireStaff)
admin.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store')
  next()
})
admin.get('/me', (req, res) => res.json({ staff: req.staff }))
admin.get('/orders', async (req, res) => {
  res.json(await listOrders({ status: req.query.status || undefined, date: req.query.date || undefined }))
})
// Pesanan yang diinput kasir (tanpa rate limit; sudah wajib login). paidMethod opsional: langsung lunas.
admin.post('/orders', async (req, res) => {
  const { order, created } = await createOrder(req.body, {
    idempotencyKey: req.get('Idempotency-Key')?.trim() || null,
    staffId: req.staff.id,
    paidMethod: req.body?.paidMethod ?? null,
  })
  res.status(created ? 201 : 200).json(order)
})
admin.patch('/orders/:id/status', async (req, res) => {
  res.json(await updateOrderStatus(req.params.id, req.body?.status))
})
admin.patch('/orders/:id/payment', async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {}
  if (!('method' in body)) return res.status(400).json({ error: 'Kirim method: "tunai", "qris_manual", atau null.' })
  res.json(await updateOrderPayment(req.params.id, body.method, req.staff.id))
})
admin.get('/menu', async (_req, res) => res.json({ items: await listMenu() }))
admin.patch('/menu/:id', async (req, res) => {
  res.json(await updateMenuItem(req.params.id, req.body))
})
admin.get('/reports/sales', async (req, res) => {
  res.json(await salesReport({ from: req.query.from || undefined, to: req.query.to || undefined }))
})
app.use('/api/admin', admin)

app.use((error, _req, res, _next) => {
  if (error instanceof SyntaxError && 'body' in error) {
    return res.status(400).json({ error: 'Format JSON tidak valid.' })
  }
  if (error.statusCode) return res.status(error.statusCode).json({ error: error.message })
  console.error(error)
  res.status(500).json({ error: 'Terjadi kesalahan pada server.' })
})

app.listen(port, () => {
  console.log(`Mie Bara API berjalan di http://localhost:${port}`)
})
