// Kosongkan nomor HP pesanan yang lebih tua dari PHONE_RETENTION_DAYS hari (default 90).
//   npm run db:retention -- --dry-run     hanya menghitung
//   npm run db:retention                  mengosongkan
//   npm run db:retention -- --days 30     menimpa PHONE_RETENTION_DAYS
import { parseArgs } from 'node:util'
import { pool } from '../db.js'
import { clearOldPhones, retentionDays } from '../services/retention.js'

const { values } = parseArgs({ options: { 'dry-run': { type: 'boolean', default: false }, days: { type: 'string' } } })

try {
  const days = retentionDays(values.days ?? process.env.PHONE_RETENTION_DAYS)
  const dryRun = values['dry-run']
  const { cutoff, affected } = await clearOldPhones(pool, { days, dryRun })
  const before = cutoff.toISOString().slice(0, 10)
  console.log(dryRun
    ? `[dry-run] ${affected} pesanan sebelum ${before} (lebih dari ${days} hari) masih menyimpan nomor HP. Tidak ada yang diubah.`
    : `Nomor HP dikosongkan pada ${affected} pesanan sebelum ${before} (lebih dari ${days} hari). Data penjualan tidak berubah.`)
} catch (error) {
  console.error(`Retensi gagal: ${error.message}`)
  process.exitCode = 1
} finally {
  await pool.end()
}
