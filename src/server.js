import express from 'express'
import { createOrder, getOrder } from './services/orders.js'
import { getMenu } from './services/menu.js'
import { pool } from './db.js'

const app = express()
const port = Number(process.env.PORT || 3000)
const allowedOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:5173'

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', allowedOrigin)
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})
app.use(express.json({ limit: '32kb' }))

app.get('/api/health', async (_req, res, next) => {
  try {
    await pool.query('SELECT 1')
    res.json({ status: 'ok', database: 'connected' })
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

app.post('/api/orders', async (req, res, next) => {
  try {
    const order = await createOrder(req.body)
    res.status(201).json(order)
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

app.use((error, _req, res, _next) => {
  if (error instanceof SyntaxError && 'body' in error) {
    return res.status(400).json({ error: 'Format JSON tidak valid.' })
  }
  console.error(error)
  res.status(500).json({ error: 'Terjadi kesalahan pada server.' })
})

app.listen(port, () => {
  console.log(`Mie Bara API berjalan di http://localhost:${port}`)
})
