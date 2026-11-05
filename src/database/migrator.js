// Migration runner sederhana untuk file SQL di database/migrations (NNN_nama.sql).
//
// Tabel schema_migrations mencatat migrasi yang sudah diterapkan:
//   method 'runner'   = dijalankan oleh runner ini
//   method 'baseline' = sudah ada sebelumnya (diterapkan manual, atau termasuk dalam schema.sql)
//
// Aturan:
// - Database kosong (belum ada tabel orders): schema.sql dijalankan, lalu SEMUA migrasi ditandai
//   baseline, karena setiap migrasi wajib juga dimasukkan ke schema.sql.
// - Database lama tanpa catatan: migrasi 001–006 diterapkan manual sebelum runner ada. Masing-masing
//   dikenali dari efeknya (LEGACY_MARKERS) dan ditandai baseline tanpa dijalankan ulang; yang efeknya
//   belum ada dijalankan.
// - Migrasi baru (007 dan seterusnya) selalu dijalankan oleh runner dan dicatat.
//
// File SQL menulis nama database kopi_miebara secara tetap; nama itu diganti dengan database target.
// MySQL meng-commit DDL otomatis, jadi migrasi yang gagal di tengah bisa meninggalkan sebagian
// perubahan: perbaiki manual, lalu jalankan ulang.
import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import mysql from 'mysql2/promise'

const DATABASE_DIR = new URL('./', import.meta.url)
const MIGRATIONS_DIR = new URL('./migrations/', import.meta.url)
const MIGRATION_FILE = /^\d{3}_[a-z0-9_]+\.sql$/

// Efek migrasi lama yang bisa diperiksa di information_schema (parameter: nama database).
const LEGACY_MARKERS = {
  '001_orders_idempotency_key.sql': `SELECT COUNT(*) AS ok FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'idempotency_key'`,
  '002_collation_and_foreign_keys.sql': `SELECT COUNT(*) AS ok FROM information_schema.REFERENTIAL_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = ? AND CONSTRAINT_NAME = 'fk_order_items_order'`,
  '003_staff_users.sql': `SELECT COUNT(*) AS ok FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'staff_users'`,
  '004_staff_users_drop_role.sql': `SELECT (SELECT COUNT(*) FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'staff_users')
    - (SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'staff_users' AND COLUMN_NAME = 'role') AS ok`,
  '005_orders_payment.sql': `SELECT COUNT(*) AS ok FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'paid_at'`,
  '006_orders_source.sql': `SELECT COUNT(*) AS ok FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'source'`,
}

export function connectionConfig(env = process.env) {
  return {
    host: env.MYSQL_HOST || '127.0.0.1',
    port: Number(env.MYSQL_PORT || 3306),
    user: env.MYSQL_USER || 'root',
    password: env.MYSQL_PASSWORD || '',
    multipleStatements: true,
    charset: 'utf8mb4',
  }
}

function assertDatabaseName(database) {
  if (!/^[a-zA-Z0-9_]+$/.test(database ?? '')) throw new Error(`Nama database tidak valid: "${database}"`)
}

// Ganti nama database tetap di file SQL dengan database target.
export function retarget(sql, database) {
  return sql.replace(/\bkopi_miebara\b/g, database)
}

const checksum = (text) => createHash('sha256').update(text).digest('hex')

export async function listMigrationFiles() {
  return (await readdir(MIGRATIONS_DIR)).filter((name) => MIGRATION_FILE.test(name)).sort()
}

async function readMigration(name) {
  return readFile(new URL(name, MIGRATIONS_DIR), 'utf8')
}

async function ensureTable(connection) {
  await connection.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name VARCHAR(255) NOT NULL PRIMARY KEY,
    checksum CHAR(64) NOT NULL,
    method ENUM('runner', 'baseline') NOT NULL,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`)
}

async function tableExists(connection, database, table) {
  const [[row]] = await connection.query(
    'SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?', [database, table]
  )
  return row.n > 0
}

async function appliedMigrations(connection, database) {
  if (!(await tableExists(connection, database, 'schema_migrations'))) return new Map()
  const [rows] = await connection.query(
    `SELECT name, checksum, method, applied_at AS appliedAt FROM \`${database}\`.schema_migrations`
  )
  return new Map(rows.map((row) => [row.name, row]))
}

async function record(connection, name, sql, method) {
  await connection.query('INSERT INTO schema_migrations (name, checksum, method) VALUES (?, ?, ?)', [name, checksum(sql), method])
}

// Status setiap file migrasi: { name, state: 'applied'|'pending', method?, appliedAt?, changed? }.
export async function migrationStatus({ database, env = process.env } = {}) {
  assertDatabaseName(database)
  const connection = await mysql.createConnection(connectionConfig(env))
  try {
    const [[{ n }]] = await connection.query('SELECT COUNT(*) AS n FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?', [database])
    const applied = n ? await appliedMigrations(connection, database) : new Map()
    const result = []
    for (const name of await listMigrationFiles()) {
      const row = applied.get(name)
      if (!row) result.push({ name, state: 'pending' })
      else {
        const changed = row.checksum !== checksum(await readMigration(name))
        result.push({ name, state: 'applied', method: row.method, appliedAt: row.appliedAt, changed })
      }
    }
    return result
  } finally {
    await connection.end()
  }
}

// Terapkan semua migrasi yang belum tercatat. Mengembalikan [{ name, action: 'schema'|'baseline'|'run' }].
export async function migrate({ database, env = process.env, log = () => {} } = {}) {
  assertDatabaseName(database)
  const connection = await mysql.createConnection(connectionConfig(env))
  const actions = []
  try {
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`
    )
    await connection.query(`USE \`${database}\``)
    const files = await listMigrationFiles()

    if (!(await tableExists(connection, database, 'orders'))) {
      const schema = retarget(await readFile(new URL('schema.sql', DATABASE_DIR), 'utf8'), database)
      await connection.query(schema)
      await connection.query(`USE \`${database}\``)
      await ensureTable(connection)
      actions.push({ name: 'schema.sql', action: 'schema' })
      log('Database kosong: schema.sql dijalankan.')
      for (const name of files) {
        await record(connection, name, await readMigration(name), 'baseline')
        actions.push({ name, action: 'baseline' })
      }
      return actions
    }

    await ensureTable(connection)
    const applied = await appliedMigrations(connection, database)
    for (const name of files) {
      if (applied.has(name)) continue
      const sql = await readMigration(name)
      const marker = LEGACY_MARKERS[name]
      if (marker) {
        const params = (marker.match(/\?/g) ?? []).map(() => database)
        const [[{ ok }]] = await connection.query(marker, params)
        if (Number(ok) > 0) {
          await record(connection, name, sql, 'baseline')
          actions.push({ name, action: 'baseline' })
          log(`${name}: sudah diterapkan sebelumnya, ditandai baseline.`)
          continue
        }
      }
      log(`${name}: menjalankan…`)
      await connection.query(retarget(sql, database))
      await connection.query(`USE \`${database}\``)
      await record(connection, name, sql, 'runner')
      actions.push({ name, action: 'run' })
    }
    return actions
  } finally {
    await connection.end()
  }
}
