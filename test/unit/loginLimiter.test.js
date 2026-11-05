import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createLoginLimiter } from '../../src/services/loginLimiter.js'

const clock = (start = 0) => {
  let time = start
  return { now: () => time, advance: (ms) => { time += ms } }
}
const MINUTE = 60_000

test('dikunci setelah maxAttempts gagal, terbuka lagi setelah jendela waktu lewat', () => {
  const c = clock()
  const limiter = createLoginLimiter({ maxAttempts: 3, windowMs: 15 * MINUTE, now: c.now })
  for (let i = 0; i < 3; i += 1) {
    assert.equal(limiter.check('ip|admin'), null)
    limiter.recordFailure('ip|admin')
  }
  assert.deepEqual(limiter.check('ip|admin'), { minutesLeft: 15 })
  c.advance(10 * MINUTE)
  assert.deepEqual(limiter.check('ip|admin'), { minutesLeft: 5 })
  c.advance(5 * MINUTE + 1)
  assert.equal(limiter.check('ip|admin'), null)
  assert.equal(limiter.size, 0, 'entri kedaluwarsa dihapus saat dicek')
})

test('reset menghapus hitungan (login berhasil)', () => {
  const limiter = createLoginLimiter({ maxAttempts: 2 })
  limiter.recordFailure('k')
  limiter.recordFailure('k')
  assert.ok(limiter.check('k'))
  limiter.reset('k')
  assert.equal(limiter.check('k'), null)
})

test('sweep membuang semua entri kedaluwarsa', () => {
  const c = clock()
  const limiter = createLoginLimiter({ windowMs: MINUTE, now: c.now })
  limiter.recordFailure('a')
  limiter.recordFailure('b')
  c.advance(MINUTE / 2)
  limiter.recordFailure('c')
  c.advance(MINUTE / 2 + 1)
  limiter.sweep()
  assert.equal(limiter.size, 1)
  assert.equal(limiter.check('c'), null)
})

test('ukuran Map tidak melewati maxEntries: kedaluwarsa disapu dulu, lalu yang tertua dibuang', () => {
  const c = clock()
  const limiter = createLoginLimiter({ maxAttempts: 1, windowMs: MINUTE, maxEntries: 3, now: c.now })
  limiter.recordFailure('lama')
  c.advance(MINUTE + 1)
  limiter.recordFailure('a')
  limiter.recordFailure('b')
  limiter.recordFailure('c') // penuh: 'lama' kedaluwarsa disapu
  assert.equal(limiter.size, 3)
  assert.ok(limiter.check('a'))
  limiter.recordFailure('d') // tidak ada yang kedaluwarsa: 'a' (tertua) dibuang
  assert.equal(limiter.size, 3)
  assert.equal(limiter.check('a'), null)
  assert.ok(limiter.check('d'))
  for (let i = 0; i < 1000; i += 1) limiter.recordFailure(`banjir-${i}`)
  assert.equal(limiter.size, 3)
})
