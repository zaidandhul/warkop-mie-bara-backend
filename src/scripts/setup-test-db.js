// Menyiapkan database uji untuk test end-to-end (frontend/e2e).
//   npm run db:test:setup   (memakai .env lalu .env.test, jadi MYSQL_DATABASE = kopi_miebara_test)
//
// Langkah: hapus & buat ulang database uji lewat migration runner (database kosong -> schema.sql, semua
// migrasi ditandai baseline di schema_migrations), seed menu, lalu kosongkan opsi kategori
// minuman/camilan seperti di database utama. Menolak jalan jika nama database tidak berakhiran _test.
import { spawnSync } from 'node:child_process'
import mysql from 'mysql2/promise'
import { listMigrationFiles, migrate } from '../database/migrator.js'

const database = process.env.MYSQL_DATABASE
if (!database || !/^[a-zA-Z0-9_]+_test$/.test(database)) {
  console.error(`Dibatalkan: MYSQL_DATABASE harus berakhiran "_test" (sekarang: "${database ?? ''}").`)
  console.error('Jalankan lewat "npm run db:test:setup" supaya .env.test dipakai.')
  process.exit(1)
}

const connection = await mysql.createConnection({
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  multipleStatements: true,
})

function runScript(file) {
  const result = spawnSync(process.execPath, [new URL(file, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')], {
    stdio: 'inherit',
    env: process.env,
  })
  if (result.status !== 0) throw new Error(`${file} gagal (kode ${result.status}).`)
}

try {
  console.log(`Membuat ulang database uji "${database}"…`)
  await connection.query(`DROP DATABASE IF EXISTS \`${database}\``)
  await migrate({ database })

  console.log('Mengisi menu (seed)…')
  runScript('./seed.js')
  runScript('./note-only-categories.js')

  // Pastikan strukturnya setara dengan database utama (semua migrasi).
  const [[checks]] = await connection.query(
    `SELECT
       (SELECT COUNT(*) FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'idempotency_key') AS idempotencyKey,
       (SELECT COUNT(*) FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'staff_users' AND COLUMN_NAME = 'role') AS staffRole,
       (SELECT COUNT(*) FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'paid_at') AS paidAt,
       (SELECT COUNT(*) FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'source') AS source,
       (SELECT COUNT(*) FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = ?) AS foreignKeys,
       (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
         WHERE TABLE_SCHEMA = ? AND CONSTRAINT_TYPE = 'CHECK' AND CONSTRAINT_NAME LIKE 'chk\\_%') AS namedChecks,
       (SELECT COUNT(*) FROM \`${database}\`.menu_items) AS menuItems,
       (SELECT COUNT(*) FROM \`${database}\`.schema_migrations) AS migrations`,
    [database, database, database, database, database, database]
  )
  const problems = []
  if (checks.idempotencyKey !== 1) problems.push('kolom orders.idempotency_key tidak ada')
  if (checks.staffRole !== 0) problems.push('kolom staff_users.role masih ada')
  if (checks.paidAt !== 1) problems.push('kolom orders.paid_at tidak ada')
  if (checks.source !== 1) problems.push('kolom orders.source tidak ada')
  if (checks.foreignKeys < 6) problems.push(`foreign key kurang (${checks.foreignKeys}/6)`)
  if (checks.namedChecks < 6) problems.push(`CHECK bernama kurang (${checks.namedChecks}/6)`)
  if (!checks.menuItems) problems.push('menu kosong')
  const migrationFiles = (await listMigrationFiles()).length
  if (checks.migrations !== migrationFiles) problems.push(`schema_migrations ${checks.migrations}/${migrationFiles}`)
  if (problems.length) throw new Error(`Struktur database uji tidak sesuai: ${problems.join('; ')}.`)

  console.log(`Database uji "${database}" siap (${checks.menuItems} menu). Buat akun admin uji dengan: npm run staff:create:test`)
} catch (error) {
  console.error(`Gagal menyiapkan database uji: ${error.message}`)
  process.exitCode = 1
} finally {
  await connection.end()
}
