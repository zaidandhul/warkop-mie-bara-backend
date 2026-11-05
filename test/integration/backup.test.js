import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { migrate } from '../../src/database/migrator.js'
import { backupDatabase, backupFileName } from '../../src/services/backup.js'
import { dropDatabase, insertOrder, tempDatabaseName, withConnection } from './helpers.js'

const database = tempDatabaseName('backup')
let outDir

before(async () => {
  await migrate({ database })
  await withConnection((c) => insertOrder(c, { code: 'MB-BACKUP-1' }), database)
  outDir = await mkdtemp(join(tmpdir(), 'mb-backup-'))
})
after(async () => {
  await dropDatabase(database)
  await rm(outDir, { recursive: true, force: true })
})

test('backup menghasilkan file bertanggal yang berisi struktur dan data', async () => {
  const now = new Date('2026-11-05T05:06:07Z')
  const { file, bytes } = await backupDatabase({ database, outDir, now })
  assert.equal(file, join(outDir, `${database}_2026-11-05_120607.sql`))
  assert.ok(bytes > 1000)
  const sql = await readFile(file, 'utf8')
  assert.match(sql, /CREATE TABLE `orders`/)
  assert.match(sql, /MB-BACKUP-1/)
  assert.match(sql, /-- Dump completed/)
})

test('database tidak ada: gagal dan tidak meninggalkan file', async () => {
  const count = (await readdir(outDir)).length
  await assert.rejects(backupDatabase({ database: 'mb_it_tidak_ada_test', outDir }), /mysqldump gagal/)
  assert.equal((await readdir(outDir)).length, count)
})

test('mysqldump tidak ditemukan: pesan jelas dan tidak meninggalkan file', async () => {
  await assert.rejects(backupDatabase({ database, outDir, mysqldump: 'tidak-ada-mysqldump-xyz' }), /MYSQLDUMP_PATH/)
  assert.equal((await readdir(outDir)).filter((name) => !name.includes('2026-11-05_120607')).length, 0)
})

test('backupFileName memakai jam WIB', () => {
  assert.equal(backupFileName('kopi_miebara', new Date('2026-11-05T20:30:00Z')), 'kopi_miebara_2026-11-06_033000.sql')
})
