import { test } from 'node:test'
import assert from 'node:assert/strict'
import { passwordProblem, staffChangeProblem, usernameProblem } from '../../src/services/staff.js'

test('usernameProblem: 3–50 karakter huruf/angka/._-', () => {
  for (const ok of ['kasir1', 'admin.utama', 'a_b-c']) assert.equal(usernameProblem(ok), null, ok)
  for (const bad of ['ab', 'nama dengan spasi', 'x'.repeat(51), '', null, 'admin@warkop']) assert.ok(usernameProblem(bad), String(bad))
})

test('passwordProblem: minimal 8 karakter, maksimal 72 byte (batas bcrypt)', () => {
  assert.equal(passwordProblem('12345678'), null)
  assert.match(passwordProblem('1234567'), /minimal 8/)
  assert.match(passwordProblem(undefined), /minimal 8/)
  assert.equal(passwordProblem('a'.repeat(72)), null)
  assert.match(passwordProblem('a'.repeat(73)), /maksimal 72/)
  assert.match(passwordProblem('é'.repeat(37)), /maksimal 72/, '74 byte UTF-8')
})

const admin = (id, extra = {}) => ({ id, isAdmin: true, isActive: true, ...extra })

test('staffChangeProblem: tidak boleh menonaktifkan atau menurunkan diri sendiri', () => {
  assert.match(staffChangeProblem({ actorId: 1, target: admin(1), changes: { isActive: false }, activeAdmins: 3 }), /akun sendiri/)
  assert.match(staffChangeProblem({ actorId: 1, target: admin(1), changes: { isAdmin: false }, activeAdmins: 3 }), /akun sendiri/)
  assert.equal(staffChangeProblem({ actorId: 1, target: admin(1), changes: { isActive: true }, activeAdmins: 3 }), null)
})

test('staffChangeProblem: harus tersisa minimal satu admin aktif', () => {
  assert.match(staffChangeProblem({ actorId: 2, target: admin(1), changes: { isActive: false }, activeAdmins: 1 }), /minimal satu admin/)
  assert.equal(staffChangeProblem({ actorId: 2, target: admin(1), changes: { isActive: false }, activeAdmins: 2 }), null)
  const staf = { id: 5, isAdmin: false, isActive: true }
  assert.equal(staffChangeProblem({ actorId: 1, target: staf, changes: { isActive: false }, activeAdmins: 1 }), null, 'staf biasa boleh dinonaktifkan')
  assert.equal(staffChangeProblem({ actorId: 1, target: staf, changes: { isAdmin: true }, activeAdmins: 1 }), null)
})
