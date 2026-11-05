import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { listMigrationFiles, migrate, migrationStatus } from '../../src/database/migrator.js'
import { dropDatabase, insertOrder, tempDatabaseName, withConnection } from './helpers.js'

const created = []
after(async () => { for (const database of created) await dropDatabase(database) })

test('database kosong: schema.sql dijalankan, semua migrasi ditandai baseline, idempoten', async () => {
  const database = tempDatabaseName('fresh')
  created.push(database)
  const files = await listMigrationFiles()

  const actions = await migrate({ database })
  assert.equal(actions[0].action, 'schema')
  assert.deepEqual(actions.slice(1).map((a) => [a.name, a.action]), files.map((name) => [name, 'baseline']))

  const status = await migrationStatus({ database })
  assert.ok(status.every((row) => row.state === 'applied' && row.method === 'baseline' && !row.changed))
  assert.deepEqual(await migrate({ database }), [], 'run kedua tidak melakukan apa-apa')
  await withConnection(async (c) => {
    const [[{ n }]] = await c.query("SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'orders'", [database])
    assert.equal(n, 1)
  })
})

test('database lama tanpa catatan: 001–004 baseline, 005–006 dijalankan, data tetap utuh', async () => {
  const database = tempDatabaseName('legacy')
  created.push(database)
  await migrate({ database })
  // Tiru database yang dibuat sebelum runner ada dan belum menerima migrasi 005 ke atas.
  // Setiap migrasi baru (007, 008, ...) harus ikut dibatalkan di sini.
  await withConnection(async (c) => {
    await c.query('DROP TABLE schema_migrations')
    const dropIfExists = async (sql) => { try { await c.query(sql) } catch (error) { if (error.code !== 'ER_CANT_DROP_FIELD_OR_KEY') throw error } }
    for (const table of ['staff_audit_log']) await c.query(`DROP TABLE IF EXISTS ${table}`)
    await dropIfExists('ALTER TABLE orders DROP FOREIGN KEY fk_orders_created_by')
    await dropIfExists('ALTER TABLE orders DROP FOREIGN KEY fk_orders_paid_by')
    await dropIfExists('ALTER TABLE orders DROP CHECK chk_orders_paid')
    await c.query('ALTER TABLE orders DROP COLUMN source, DROP COLUMN created_by_staff_id, DROP COLUMN paid_at, DROP COLUMN paid_method, DROP COLUMN paid_by_staff_id')
    await c.query('ALTER TABLE staff_users DROP COLUMN is_admin, DROP COLUMN session_version') // 008
    await insertOrder(c, { code: 'MB-LAMA-1', phone: '081200000001' })
    await insertOrder(c, { code: 'MB-LAMA-2' })
  }, database)

  const actions = await migrate({ database })
  const byName = Object.fromEntries(actions.map((a) => [a.name, a.action]))
  for (const name of ['001_orders_idempotency_key.sql', '002_collation_and_foreign_keys.sql', '003_staff_users.sql', '004_staff_users_drop_role.sql']) {
    assert.equal(byName[name], 'baseline', name)
  }
  assert.equal(byName['005_orders_payment.sql'], 'run')
  assert.equal(byName['006_orders_source.sql'], 'run')
  for (const [name, action] of Object.entries(byName)) {
    if (!/^00[1-6]_/.test(name)) assert.equal(action, 'run', `${name} (migrasi baru) harus dijalankan`)
  }

  await withConnection(async (c) => {
    const [rows] = await c.query('SELECT order_code, source, paid_at FROM orders ORDER BY order_code')
    assert.deepEqual(rows.map((r) => [r.order_code, r.source, r.paid_at]), [['MB-LAMA-1', 'pelanggan', null], ['MB-LAMA-2', 'pelanggan', null]])
  }, database)
  assert.ok((await migrationStatus({ database })).every((row) => row.state === 'applied'))
  assert.deepEqual(await migrate({ database }), [])
})

test('nama database tidak valid ditolak', async () => {
  await assert.rejects(migrate({ database: 'x; DROP DATABASE y' }), /tidak valid/)
})
