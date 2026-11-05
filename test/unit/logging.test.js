import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { serializeError } from '../../src/logger.js'
import { requestLog } from '../../src/middleware/requestLog.js'
import { errorHandler } from '../../src/middleware/errorHandler.js'

function fakeLogger() {
  const entries = []
  return { entries, info: (fields, message) => entries.push({ level: 'info', fields, message }), error: (fields, message) => entries.push({ level: 'error', fields, message }) }
}

function fakeRes() {
  const res = new EventEmitter()
  res.statusCode = 200
  res.status = (code) => { res.statusCode = code; return res }
  res.json = (body) => { res.body = body; return res }
  return res
}

test('requestLog mencatat method, path tanpa query, status, durasi; tidak ada body/header/cookie', () => {
  const logger = fakeLogger()
  let clock = 1000
  const middleware = requestLog(logger, { now: () => clock })
  const req = {
    method: 'POST',
    originalUrl: '/api/orders?tableNumber=5&phone=081234567890',
    headers: { cookie: 'mb_staff=token-rahasia', authorization: 'Bearer x' },
    body: { customer: { phone: '081234567890' } },
  }
  const res = fakeRes()
  let nextCalled = false
  middleware(req, res, () => { nextCalled = true })
  assert.equal(nextCalled, true)
  assert.equal(logger.entries.length, 0, 'baru dicatat setelah respons selesai')
  res.statusCode = 201
  clock += 12.34
  res.emit('finish')
  assert.deepEqual(logger.entries[0].fields, { method: 'POST', path: '/api/orders', status: 201, durationMs: 12.3 })
  const text = JSON.stringify(logger.entries)
  for (const secret of ['token-rahasia', '081234567890', 'Bearer', 'cookie']) assert.ok(!text.includes(secret), secret)
})

test('serializeError menyimpan stack tetapi membuang properti lain (mis. sql berisi data)', () => {
  const error = Object.assign(new Error('gagal'), { code: 'ER_X', sql: "INSERT ... '081234567890'", sqlMessage: 'x' })
  const serialized = serializeError(error)
  assert.deepEqual(Object.keys(serialized).sort(), ['code', 'message', 'stack', 'type'])
  assert.match(serialized.stack, /gagal/)
  assert.ok(!JSON.stringify(serialized).includes('081234567890'))
})

test('errorHandler: error tak terduga -> 500 generik ke klien, stack di log', () => {
  const logger = fakeLogger()
  const res = fakeRes()
  errorHandler(logger)(new Error('koneksi putus: detail internal'), { method: 'GET', originalUrl: '/api/menu?x=1' }, res, () => {})
  assert.equal(res.statusCode, 500)
  assert.deepEqual(res.body, { error: 'Terjadi kesalahan pada server.' })
  assert.equal(logger.entries[0].level, 'error')
  assert.equal(logger.entries[0].fields.path, '/api/menu')
  assert.match(logger.entries[0].fields.err.stack, /koneksi putus/)
})

test('errorHandler: error ber-statusCode dan JSON rusak tidak dicatat sebagai error', () => {
  const logger = fakeLogger()
  const res = fakeRes()
  errorHandler(logger)(Object.assign(new Error('Nomor meja tidak valid.'), { statusCode: 400 }), {}, res, () => {})
  assert.equal(res.statusCode, 400)
  assert.deepEqual(res.body, { error: 'Nomor meja tidak valid.' })
  const badJson = Object.assign(new SyntaxError('Unexpected token'), { body: '{' })
  errorHandler(logger)(badJson, {}, res, () => {})
  assert.deepEqual(res.body, { error: 'Format JSON tidak valid.' })
  assert.equal(logger.entries.length, 0)
})
