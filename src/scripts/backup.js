// Backup manual database (MYSQL_DATABASE) ke src/database/dump/ (di-ignore git), atau ke BACKUP_DIR.
//   npm run db:backup
// Penjadwalan otomatis menyusul di fase hosting. Cara restore: docs/RUNBOOK.md.
import { fileURLToPath } from 'node:url'
import { backupDatabase } from '../services/backup.js'

const database = process.env.MYSQL_DATABASE || 'kopi_miebara'
const outDir = process.env.BACKUP_DIR || fileURLToPath(new URL('../database/dump/', import.meta.url))

try {
  const { file, bytes } = await backupDatabase({ database, outDir })
  console.log(`Backup "${database}" tersimpan: ${file} (${(bytes / 1024).toFixed(1)} KB, terverifikasi).`)
} catch (error) {
  console.error(`Backup gagal: ${error.message}`)
  process.exitCode = 1
}
