import { test } from 'node:test'
import assert from 'node:assert/strict'
import jwt from 'jsonwebtoken'

process.env.JWT_SECRET = 'rahasia-uji-unit-test-yang-panjang-sekali-0123456789'
const { verifyStaffToken } = await import('../../src/services/auth.js')
const secret = process.env.JWT_SECRET

test('token HS256 yang sah diterima', () => {
  const token = jwt.sign({ sub: '7' }, secret, { algorithm: 'HS256', expiresIn: '1h' })
  assert.equal(verifyStaffToken(token).sub, '7')
})

test('token dengan algoritma lain (HS512) ditolak walau rahasianya sama', () => {
  const token = jwt.sign({ sub: '7' }, secret, { algorithm: 'HS512' })
  assert.throws(() => verifyStaffToken(token), { statusCode: 401 })
})

test('token alg "none" (tanpa tanda tangan) ditolak', () => {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({ sub: '7' })).toString('base64url')
  assert.throws(() => verifyStaffToken(`${header}.${payload}.`), { statusCode: 401 })
})

test('token kedaluwarsa, rahasia lain, dan token kosong ditolak 401', () => {
  const expired = jwt.sign({ sub: '7', exp: Math.floor(Date.now() / 1000) - 10 }, secret, { algorithm: 'HS256' })
  assert.throws(() => verifyStaffToken(expired), { statusCode: 401 })
  assert.throws(() => verifyStaffToken(jwt.sign({ sub: '7' }, 'rahasia-lain-yang-juga-panjang-0123456789')), { statusCode: 401 })
  assert.throws(() => verifyStaffToken(''), { statusCode: 401, message: /login terlebih dahulu/ })
})
