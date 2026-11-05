import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assertProductionEnv, productionEnvProblems } from '../../src/config/env.js'

const GOOD = {
  NODE_ENV: 'production',
  JWT_SECRET: 'q3V9xL2mN8pR4tY7wB1cD6fG0hJ5kZ2a',
  MYSQL_USER: 'miebara_app',
  MYSQL_PASSWORD: 'p@ss-kuat',
}

test('konfigurasi produksi yang benar tidak punya masalah', () => {
  assert.deepEqual(productionEnvProblems(GOOD), [])
})

test('JWT_SECRET kosong, pendek, atau nilai contoh ditolak', () => {
  assert.match(productionEnvProblems({ ...GOOD, JWT_SECRET: '' }).join(), /JWT_SECRET kosong/)
  assert.match(productionEnvProblems({ ...GOOD, JWT_SECRET: 'pendek' }).join(), /kurang dari 32/)
  for (const sample of ['ganti-dengan-rahasia-acak-minimal-32-karakter', 'change-me-change-me-change-me-12345', 'a'.repeat(40)]) {
    assert.match(productionEnvProblems({ ...GOOD, JWT_SECRET: sample }).join(), /nilai contoh/, sample)
  }
})

test('MYSQL_USER root atau kosong dan MYSQL_PASSWORD kosong ditolak', () => {
  assert.match(productionEnvProblems({ ...GOOD, MYSQL_USER: 'root' }).join(), /tidak boleh root/)
  assert.match(productionEnvProblems({ ...GOOD, MYSQL_USER: ' ROOT ' }).join(), /tidak boleh root/)
  assert.match(productionEnvProblems({ ...GOOD, MYSQL_USER: '' }).join(), /MYSQL_USER kosong/)
  assert.match(productionEnvProblems({ ...GOOD, MYSQL_PASSWORD: '' }).join(), /MYSQL_PASSWORD kosong/)
})

test('pesan tidak memuat nilai rahasia', () => {
  const secret = 'rahasia-yang-tidak-boleh-bocor'
  assert.ok(!productionEnvProblems({ ...GOOD, JWT_SECRET: secret, MYSQL_USER: 'root' }).join().includes(secret))
})

test('assertProductionEnv: hanya memeriksa di production, exit(1) bila ada masalah', () => {
  const calls = []
  const deps = { log: (message) => calls.push(['log', message]), exit: (code) => calls.push(['exit', code]) }
  assertProductionEnv({ NODE_ENV: 'development', MYSQL_USER: 'root' }, deps)
  assertProductionEnv(GOOD, deps)
  assert.deepEqual(calls, [])
  assertProductionEnv({ ...GOOD, MYSQL_USER: 'root', MYSQL_PASSWORD: '' }, deps)
  assert.deepEqual(calls.map(([kind]) => kind), ['log', 'exit'])
  assert.equal(calls[1][1], 1)
  assert.match(calls[0][1], /root/)
})

test('rahasia acak base64url (seperti dari crypto.randomBytes) tidak dianggap nilai contoh', async () => {
  const { randomBytes } = await import('node:crypto')
  for (let i = 0; i < 20000; i += 1) {
    const secret = randomBytes(48).toString('base64url')
    assert.deepEqual(productionEnvProblems({ ...GOOD, JWT_SECRET: secret }), [], secret)
  }
})
