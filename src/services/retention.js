// Retensi data pribadi: kosongkan nomor HP pesanan yang lebih tua dari N hari. Hanya kolom
// customer_phone yang diubah; total, item, status, dan data penjualan lain tetap utuh.
export const DEFAULT_PHONE_RETENTION_DAYS = 90

export function retentionDays(value) {
  if (value === undefined || value === null || value === '') return DEFAULT_PHONE_RETENTION_DAYS
  const days = Number(value)
  if (!Number.isInteger(days) || days < 1) throw new Error(`Jumlah hari retensi tidak valid: "${value}" (bilangan bulat >= 1).`)
  return days
}

// { cutoff, affected }. dryRun = true hanya menghitung tanpa mengubah apa pun.
export async function clearOldPhones(connection, { days = DEFAULT_PHONE_RETENTION_DAYS, dryRun = false, now = new Date() } = {}) {
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
  if (dryRun) {
    const [[{ n }]] = await connection.execute(
      'SELECT COUNT(*) AS n FROM orders WHERE customer_phone IS NOT NULL AND created_at < ?', [cutoff]
    )
    return { cutoff, affected: Number(n) }
  }
  const [result] = await connection.execute(
    'UPDATE orders SET customer_phone = NULL WHERE customer_phone IS NOT NULL AND created_at < ?', [cutoff]
  )
  return { cutoff, affected: result.affectedRows }
}
