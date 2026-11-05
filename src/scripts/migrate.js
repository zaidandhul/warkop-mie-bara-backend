// Migrasi database (lihat src/database/migrator.js).
//   npm run db:migrate          terapkan migrasi yang belum tercatat
//   npm run db:migrate:status   tampilkan status setiap migrasi
import { migrate, migrationStatus } from '../database/migrator.js'

const command = process.argv[2] ?? 'up'
const database = process.env.MYSQL_DATABASE || 'kopi_miebara'

try {
  if (command === 'status') {
    const rows = await migrationStatus({ database })
    console.log(`Status migrasi database "${database}":`)
    for (const row of rows) {
      const detail = row.state === 'applied'
        ? `sudah (${row.method}, ${new Date(row.appliedAt).toISOString().slice(0, 16).replace('T', ' ')} UTC)${row.changed ? ' ⚠ file berubah setelah diterapkan' : ''}`
        : 'BELUM'
      console.log(`  ${row.name.padEnd(40)} ${detail}`)
    }
    const pending = rows.filter((row) => row.state === 'pending').length
    console.log(pending ? `${pending} migrasi belum diterapkan. Jalankan: npm run db:migrate` : 'Semua migrasi sudah diterapkan.')
  } else if (command === 'up') {
    const actions = await migrate({ database, log: (message) => console.log(`  ${message}`) })
    const ran = actions.filter((action) => action.action === 'run').length
    const baseline = actions.filter((action) => action.action === 'baseline').length
    console.log(actions.length
      ? `Selesai untuk "${database}": ${ran} dijalankan, ${baseline} ditandai baseline.`
      : `Tidak ada migrasi baru untuk "${database}".`)
  } else {
    throw new Error(`Perintah tidak dikenal: ${command} (pakai "up" atau "status")`)
  }
} catch (error) {
  console.error(`Migrasi gagal: ${error.message}`)
  process.exitCode = 1
}
