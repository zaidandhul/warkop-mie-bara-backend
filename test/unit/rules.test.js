import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isUuid, normalizePhone, normalizeTableNumber } from '../../src/utils/validation.js'
import { todayWib, wibDateHour, wibDayRange } from '../../src/utils/time.js'
import { TRANSITIONS, transitionProblem } from '../../src/services/admin.js'
import { rankBestSellers } from '../../src/services/menu.js'

test('normalizeTableNumber: trim, nol di depan, 1–TABLE_COUNT (default 10)', () => {
  assert.equal(normalizeTableNumber(' 05 '), '5')
  assert.equal(normalizeTableNumber(10), '10')
  for (const bad of ['0', '11', '5a', '', null, undefined, '-1', '1.5', '00001']) assert.equal(normalizeTableNumber(bad), null, String(bad))
})

test('normalizePhone: +62/62 -> 0, spasi/tanda baca dibuang, 08 + 8–11 digit', () => {
  assert.equal(normalizePhone('+62 812-3456-7890'), '081234567890')
  assert.equal(normalizePhone('62812345678'), '0812345678') // terpendek: 08 + 8 digit
  assert.equal(normalizePhone('6281234567'), null) // 08 + 7 digit
  assert.equal(normalizePhone('(0812) 3456.7890'), '081234567890')
  assert.equal(normalizePhone(''), '')
  for (const bad of ['0812', '0712345678', '0812345678901234', 'abc']) assert.equal(normalizePhone(bad), null, bad)
})

test('isUuid', () => {
  assert.equal(isUuid('3f2b8a3e-1c4d-4e5f-9a6b-7c8d9e0f1a2b'), true)
  for (const bad of ['', 'bukan-uuid', 123, null]) assert.equal(isUuid(bad), false)
})

test('wibDayRange: hari WIB = 17:00 UTC hari sebelumnya s/d 17:00 UTC, tanggal tidak valid -> null', () => {
  const range = wibDayRange('2026-11-05')
  assert.equal(range.start.toISOString(), '2026-11-04T17:00:00.000Z')
  assert.equal(range.end.toISOString(), '2026-11-05T17:00:00.000Z')
  for (const bad of ['2026-02-30', '2026-13-01', '05-11-2026', '', null]) assert.equal(wibDayRange(bad), null, String(bad))
})

test('todayWib dan wibDateHour mengikuti jam WIB (UTC+7)', () => {
  assert.equal(todayWib(new Date('2026-11-05T16:59:59Z')), '2026-11-05')
  assert.equal(todayWib(new Date('2026-11-05T17:00:00Z')), '2026-11-06')
  assert.deepEqual(wibDateHour('2026-11-05T20:30:00Z'), { date: '2026-11-06', hour: 3 })
})

test('transitionProblem: hanya alur menunggu→diproses→siap→selesai dan batal dari menunggu/diproses', () => {
  const allowed = [['menunggu', 'diproses'], ['diproses', 'siap'], ['siap', 'selesai'], ['menunggu', 'dibatalkan'], ['diproses', 'dibatalkan']]
  for (const [from, to] of allowed) assert.equal(transitionProblem(from, to), null, `${from}→${to}`)
  const statuses = Object.keys(TRANSITIONS)
  for (const from of statuses) {
    for (const to of statuses) {
      if (from === to || allowed.some(([a, b]) => a === from && b === to)) continue
      assert.equal(transitionProblem(from, to)?.statusCode, 400, `${from}→${to} harus ditolak`)
    }
  }
  assert.equal(transitionProblem('siap', 'siap').statusCode, 409)
  assert.match(transitionProblem('menunggu', 'hilang').message, /tidak dikenal/)
  assert.match(transitionProblem('diproses', 'dibatalkan', true).message, /sudah lunas/)
})

test('rankBestSellers: terjual terbanyak dulu, seri ikut urutan menu, tanpa penjualan tidak diberi peringkat', () => {
  const items = ['a', 'b', 'c', 'd'].map((id) => ({ id }))
  const ranks = rankBestSellers(items, new Map([['c', 9], ['b', 3], ['d', 3], ['x', 50]]))
  assert.deepEqual([...ranks], [['c', 1], ['b', 2], ['d', 3]])
  assert.equal(ranks.has('a'), false)
  assert.equal(ranks.has('x'), false, 'item di luar daftar (mis. menu habis) diabaikan')
  assert.equal(rankBestSellers(items, new Map()).size, 0)
})
