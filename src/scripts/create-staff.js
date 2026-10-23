// Membuat akun staf (admin) dashboard.
//   Interaktif:      npm run staff:create
//   Non-interaktif:  STAFF_PASSWORD=... npm run staff:create -- --username admin1
import { createInterface } from 'node:readline'
import { parseArgs } from 'node:util'
import { pool } from '../db.js'
import { hashPassword } from '../services/auth.js'

const MIN_PASSWORD_LENGTH = 8

function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => rl.question(question, (answer) => {
    rl.close()
    resolve(answer.trim())
  }))
}

// Seperti ask(), tetapi ketikan tidak ditampilkan di layar.
function askHidden(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
  const write = rl._writeToOutput.bind(rl)
  rl._writeToOutput = (text) => write(text.startsWith(question) ? question : '')
  return new Promise((resolve) => rl.question(question, (answer) => {
    rl.close()
    process.stdout.write('\n')
    resolve(answer)
  }))
}

const { values } = parseArgs({ options: { username: { type: 'string' } } })

try {
  const username = values.username ?? await ask('Username: ')
  if (!/^[a-zA-Z0-9._-]{3,50}$/.test(username)) {
    throw new Error('Username harus 3–50 karakter: huruf, angka, titik, garis bawah, atau tanda minus.')
  }

  let password = process.env.STAFF_PASSWORD
  if (!password) {
    password = await askHidden('Password: ')
    if (password !== await askHidden('Ulangi password: ')) throw new Error('Password tidak sama.')
  }
  if (password.length < MIN_PASSWORD_LENGTH) throw new Error(`Password minimal ${MIN_PASSWORD_LENGTH} karakter.`)

  const [existing] = await pool.execute('SELECT id FROM staff_users WHERE username = ?', [username])
  if (existing.length) throw new Error(`Username "${username}" sudah dipakai.`)

  await pool.execute(
    'INSERT INTO staff_users (username, password_hash) VALUES (?, ?)',
    [username, await hashPassword(password)]
  )
  console.log(`Akun admin "${username}" berhasil dibuat. Login di /admin/login.`)
} catch (error) {
  console.error(`Gagal membuat akun: ${error.message}`)
  process.exitCode = 1
} finally {
  await pool.end()
}
