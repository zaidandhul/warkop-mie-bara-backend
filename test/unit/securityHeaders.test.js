import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SECURITY_HEADERS, securityHeaders } from '../../src/middleware/securityHeaders.js'

test('securityHeaders memasang semua header lalu lanjut ke handler berikutnya', () => {
  const headers = {}
  const res = { set: (values) => Object.assign(headers, values) }
  let nextCalled = false
  securityHeaders({}, res, () => { nextCalled = true })
  assert.equal(nextCalled, true)
  assert.equal(headers['X-Content-Type-Options'], 'nosniff')
  assert.equal(headers['X-Frame-Options'], 'DENY')
  assert.equal(headers['Referrer-Policy'], 'no-referrer')
  assert.match(headers['Content-Security-Policy'], /default-src 'none'/)
  assert.match(headers['Content-Security-Policy'], /frame-ancestors 'none'/)
  assert.deepEqual(headers, SECURITY_HEADERS)
})
