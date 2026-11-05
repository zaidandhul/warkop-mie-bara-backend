// Backup database dengan mysqldump ke file .sql bertanggal, lalu verifikasi hasilnya.
import { spawn } from 'node:child_process'
import { createWriteStream, existsSync, readdirSync } from 'node:fs'
import { mkdir, open, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'

// Lokasi mysqldump: MYSQLDUMP_PATH, lalu lokasi umum Laragon/XAMPP di Windows, lalu PATH.
export function findMysqldump(env = process.env) {
  const list = []
  if (env.MYSQLDUMP_PATH) list.push(env.MYSQLDUMP_PATH)
  const laragon = 'C:\\laragon\\bin\\mysql'
  if (existsSync(laragon)) {
    for (const dir of readdirSync(laragon).sort().reverse()) list.push(join(laragon, dir, 'bin', 'mysqldump.exe'))
  }
  list.push('C:\\xampp\\mysql\\bin\\mysqldump.exe')
  return list.find((path) => existsSync(path)) ?? 'mysqldump'
}

// Nama file: <database>_YYYY-MM-DD_HHmmss.sql (jam WIB).
export function backupFileName(database, now = new Date()) {
  const wib = new Date(now.getTime() + 7 * 60 * 60 * 1000).toISOString()
  return `${database}_${wib.slice(0, 10)}_${wib.slice(11, 19).replaceAll(':', '')}.sql`
}

async function tail(file, bytes = 512) {
  const handle = await open(file, 'r')
  try {
    const { size } = await handle.stat()
    const buffer = Buffer.alloc(Math.min(bytes, size))
    await handle.read(buffer, 0, buffer.length, size - buffer.length)
    return buffer.toString('utf8')
  } finally {
    await handle.close()
  }
}

function runMysqldump(mysqldump, args, env, file) {
  return new Promise((resolve, reject) => {
    const stderr = []
    const child = spawn(mysqldump, args, { env: { ...env, MYSQL_PWD: env.MYSQL_PASSWORD || '' } })
    const output = createWriteStream(file)
    child.stdout.pipe(output)
    child.stderr.on('data', (chunk) => stderr.push(chunk))
    // mysqldump tidak bisa dijalankan: tunggu stream file tertutup dulu, supaya file yang dihapus
    // pemanggil tidak dibuat ulang oleh stream yang baru terbuka. Di Windows event 'close' (kode
    // -4058) juga muncul; abaikan karena error spawn sudah ditangani.
    let spawnFailed = false
    child.on('error', (error) => {
      spawnFailed = true
      output.on('close', () => reject(error))
      output.destroy()
    })
    child.on('close', (code) => {
      if (spawnFailed) return
      output.end(() => resolve({ code, stderr: Buffer.concat(stderr).toString('utf8') }))
    })
  })
}

// { file, bytes }. Melempar error (dan menghapus file setengah jadi) jika mysqldump gagal atau hasilnya
// kosong/terpotong. Password dikirim lewat MYSQL_PWD, jadi tidak terlihat di daftar proses.
export async function backupDatabase({ database, outDir, env = process.env, now = new Date(), mysqldump = findMysqldump(env) }) {
  if (!/^[a-zA-Z0-9_]+$/.test(database ?? '')) throw new Error(`Nama database tidak valid: "${database}"`)
  await mkdir(outDir, { recursive: true })
  const file = join(outDir, backupFileName(database, now))
  const args = [
    `--host=${env.MYSQL_HOST || '127.0.0.1'}`, `--port=${env.MYSQL_PORT || 3306}`, `--user=${env.MYSQL_USER || 'root'}`,
    '--single-transaction', '--routines', '--triggers', '--no-tablespaces', '--default-character-set=utf8mb4',
    '--databases', database,
  ]
  const fail = async (reason) => {
    await rm(file, { force: true })
    throw new Error(reason)
  }
  let result
  try {
    result = await runMysqldump(mysqldump, args, env, file)
  } catch (error) {
    await fail(`mysqldump tidak bisa dijalankan (${mysqldump}): ${error.message}. Isi MYSQLDUMP_PATH.`)
  }
  if (result.code !== 0) {
    const reason = result.stderr.trim().split('\n').filter((line) => !/password/i.test(line)).slice(-2).join(' ')
    await fail(`mysqldump gagal (kode ${result.code}): ${reason}`)
  }
  const { size } = await stat(file)
  if (!size) await fail('File backup kosong.')
  if (!(await tail(file)).includes('-- Dump completed')) await fail('File backup tidak lengkap (tidak ada penanda "Dump completed").')
  return { file, bytes: size }
}
