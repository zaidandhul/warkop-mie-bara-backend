import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { migrate } from '../../src/database/migrator.js'
import { clearOldPhones, retentionDays } from '../../src/services/retention.js'
import { dropDatabase, insertOrder, tempDatabaseName, withConnection } from './helpers.js'

const database = tempDatabaseName('retention')
const day = 24 * 60 * 60 * 1000
const now = new Date('2026-11-05T05:00:00Z')

before(async () => {
  await migrate({ database })
  await withConnection(async (c) => {
    await insertOrder(c, { code: 'MB-TUA-HP', phone: '081200000001', createdAt: new Date(now - 120 * day), total: 15000 })
    await insertOrder(c, { code: 'MB-TUA-91', phone: '081200000002', createdAt: new Date(now - 91 * day), total: 20000 })
    await insertOrder(c, { code: 'MB-TUA-NOHP', phone: null, createdAt: new Date(now - 200 * day), total: 5000 })
    await insertOrder(c, { code: 'MB-BARU', phone: '081200000003', createdAt: new Date(now - 10 * day), total: 7000 })
  }, database)
})
after(() => dropDatabase(database))

const snapshot = (c) => c.query('SELECT order_code, customer_phone, total, status FROM orders ORDER BY order_code').then(([rows]) => rows)

test('dry-run menghitung tanpa mengubah, lalu run mengosongkan HP lama saja; data penjualan utuh', async () => {
  await withConnection(async (c) => {
    const original = await snapshot(c)
    const dry = await clearOldPhones(c, { days: 90, dryRun: true, now })
    assert.equal(dry.affected, 2)
    assert.deepEqual(await snapshot(c), original, 'dry-run tidak boleh mengubah data')

    const run = await clearOldPhones(c, { days: 90, now })
    assert.equal(run.affected, 2)
    const after = await snapshot(c)
    assert.deepEqual(after.map((r) => [r.order_code, r.customer_phone]), [
      ['MB-BARU', '081200000003'], ['MB-TUA-91', null], ['MB-TUA-HP', null], ['MB-TUA-NOHP', null],
    ])
    assert.deepEqual(after.map((r) => [r.order_code, r.total, r.status]), original.map((r) => [r.order_code, r.total, r.status]))
    assert.equal((await clearOldPhones(c, { days: 90, now })).affected, 0, 'run kedua tidak mengubah apa pun')
  }, database)
})

test('retentionDays: default 90, menolak nilai tidak valid', () => {
  assert.equal(retentionDays(undefined), 90)
  assert.equal(retentionDays(''), 90)
  assert.equal(retentionDays('30'), 30)
  for (const bad of ['0', '-5', '2.5', 'abc']) assert.throws(() => retentionDays(bad), /tidak valid/)
})
