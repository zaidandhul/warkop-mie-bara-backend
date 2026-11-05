import mysql from 'mysql2/promise'

export const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'kopi_miebara',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
  decimalNumbers: true,
  // Sesi MySQL dan konversi Date di mysql2 sama-sama UTC, jadi hasil tidak bergantung pada zona
  // waktu laptop/server. Batas hari WIB dihitung di utils/time.js.
  timezone: 'Z',
})

pool.on('connection', (connection) => {
  connection.query("SET time_zone = '+00:00'")
})

// Jalankan fn(connection) dalam satu transaksi: commit bila sukses, rollback bila fn melempar error.
export async function withTransaction(fn) {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const result = await fn(connection)
    await connection.commit()
    return result
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}
