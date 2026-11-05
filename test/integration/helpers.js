// Helper integration test: database sementara bernama mb_it_<acak>_test di server MySQL dari env
// (.env lalu .env.test). Hanya nama berakhiran _test yang boleh dibuat/dihapus.
import { randomBytes } from 'node:crypto'
import mysql from 'mysql2/promise'
import { connectionConfig } from '../../src/database/migrator.js'

export function tempDatabaseName(label) {
  return `mb_it_${label}_${randomBytes(3).toString('hex')}_test`
}

export async function withConnection(fn, database) {
  const connection = await mysql.createConnection({ ...connectionConfig(), ...(database ? { database } : {}) })
  try {
    return await fn(connection)
  } finally {
    await connection.end()
  }
}

export async function dropDatabase(database) {
  if (!/^mb_it_[a-z0-9_]+_test$/.test(database)) throw new Error(`Menolak menghapus ${database}`)
  await withConnection((connection) => connection.query(`DROP DATABASE IF EXISTS \`${database}\``))
}

// Pesanan minimal yang memenuhi CHECK constraint.
export async function insertOrder(connection, { code, phone = null, createdAt = null, total = 10000 }) {
  await connection.query(
    `INSERT INTO orders (order_code, table_number, customer_name, customer_phone, payment_method, subtotal, fee, total, created_at)
     VALUES (?, '1', 'Uji', ?, 'cashier', ?, 0, ?, COALESCE(?, CURRENT_TIMESTAMP))`,
    [code, phone, total, total, createdAt]
  )
}
