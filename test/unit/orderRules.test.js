import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tableLimitMessage, unitPrice, validateLine, validateOrderRequest } from '../../src/services/orderRules.js'

const MILO = [{ itemId: 'milo', qty: 1 }]
const request = (overrides = {}) => ({ tableNumber: '5', customer: { name: 'Budi', phone: '' }, paymentMethod: 'cashier', items: MILO, ...overrides })

test('validateOrderRequest: menormalkan meja, nama, nomor HP', () => {
  const result = validateOrderRequest(request({ tableNumber: ' 05 ', customer: { name: '  Budi Santoso ', phone: '+62 812-3456-7890' } }))
  assert.deepEqual(result, { items: MILO, tableNumber: '5', name: 'Budi Santoso', phone: '081234567890', paymentMethod: 'cashier' })
  assert.equal(validateOrderRequest(request()).phone, '', 'nomor HP opsional')
})

test('validateOrderRequest: menolak item kosong/berlebih, meja di luar 1–10, nama, HP, metode bayar', () => {
  const cases = [
    [{ items: [] }, /minimal satu item/],
    [{ items: Array.from({ length: 51 }, () => MILO[0]) }, /maksimal 50 baris/],
    [{ tableNumber: '0' }, /Nomor meja tidak valid/],
    [{ tableNumber: '11' }, /1 sampai 10/],
    [{ tableNumber: '5a' }, /Nomor meja tidak valid/],
    [{ customer: { name: 'B' } }, /Nama pemesan/],
    [{ customer: { name: 'x'.repeat(101) } }, /Nama pemesan/],
    [{ customer: { name: 'Budi', phone: '0812' } }, /Nomor HP tidak valid/],
    [{ paymentMethod: 'online' }, /online belum tersedia/],
    [{ paymentMethod: undefined }, /Metode pembayaran tidak valid/],
  ]
  for (const [overrides, message] of cases) {
    assert.throws(() => validateOrderRequest(request(overrides)), { statusCode: 400, message }, JSON.stringify(overrides).slice(0, 60))
  }
  assert.throws(() => validateOrderRequest(null), /minimal satu item/)
})

test('validateOrderRequest untuk kasir: nama kosong menjadi "Meja N", metode selalu cashier', () => {
  const result = validateOrderRequest(request({ customer: {}, paymentMethod: 'online' }), { staffId: 1 })
  assert.equal(result.name, 'Meja 5')
  assert.equal(result.paymentMethod, 'cashier')
})

const mie = {
  name: 'Mie Bangladesh', is_active: 1, price: 13000,
  levels_json: '[1,2,3,4]', options_json: null, allowed_toppings_json: '["telur","sosis"]',
}

test('validateLine: opsi sah dikembalikan dalam bentuk ternormalisasi', () => {
  const line = validateLine(mie, { qty: '2', options: { level: '3', toppings: ['telur'], note: '  tanpa sayur  ' } })
  assert.deepEqual(line, { qty: 2, level: 3, variant: null, toppingIds: ['telur'], note: 'tanpa sayur' })
  assert.equal(validateLine(mie, { qty: 1, options: { note: 'x'.repeat(300) } }).note.length, 250)
  assert.deepEqual(validateLine(mie, { qty: 1 }), { qty: 1, level: null, variant: null, toppingIds: [], note: '' })
})

test('validateLine: menu habis, qty, level, varian, dan topping yang tidak terdaftar ditolak', () => {
  const cases = [
    [{ ...mie, is_active: 0 }, { qty: 1 }, /sedang tidak tersedia/],
    [mie, { qty: 0 }, /harus 1 sampai 50/],
    [mie, { qty: 51 }, /harus 1 sampai 50/],
    [mie, { qty: 1.5 }, /harus 1 sampai 50/],
    [mie, { qty: 1, options: { level: 5 } }, /Level 5 tidak tersedia/],
    [{ ...mie, levels_json: null }, { qty: 1, options: { level: 1 } }, /tidak memiliki pilihan level/],
    [mie, { qty: 1, options: { variant: 'Dingin' } }, /tidak memiliki pilihan varian/],
    [{ ...mie, options_json: '["Panas"]' }, { qty: 1, options: { variant: 'Dingin' } }, /Varian "Dingin" tidak tersedia/],
    [mie, { qty: 1, options: { toppings: ['keju'] } }, /Topping "keju" tidak tersedia/],
    [mie, { qty: 1, options: { toppings: ['telur', 'telur'] } }, /tidak valid/],
    [mie, { qty: 1, options: { toppings: 'telur' } }, /tidak valid/],
    [{ ...mie, allowed_toppings_json: null }, { qty: 1, options: { toppings: ['telur'] } }, /tidak bisa diberi topping/],
  ]
  for (const [item, input, message] of cases) assert.throws(() => validateLine(item, input), { statusCode: 400, message })
})

test('validateLine membaca kolom JSON dalam bentuk string, Buffer, atau array (MariaDB/MySQL)', () => {
  for (const levels of ['[1,2]', Buffer.from('[1,2]'), [1, 2]]) {
    assert.equal(validateLine({ ...mie, levels_json: levels }, { qty: 1, options: { level: 2 } }).level, 2)
  }
})

test('unitPrice: harga dasar + (level - 1) * kenaikan + topping', () => {
  const toppings = [{ id: 'telur', price: 3500 }, { id: 'sosis', price: 3000 }]
  assert.equal(unitPrice({ basePrice: 13000 }), 13000)
  assert.equal(unitPrice({ basePrice: 13000, level: 1, levelPriceStep: 1000 }), 13000)
  assert.equal(unitPrice({ basePrice: 13000, level: 3, levelPriceStep: 1000 }), 15000)
  assert.equal(unitPrice({ basePrice: 13000, level: 2, levelPriceStep: 0, toppings }), 19500)
})

test('tableLimitMessage: null di bawah batas atau tanpa batas, pesan di batas', () => {
  assert.equal(tableLimitMessage('2', 4, 5), null)
  assert.match(tableLimitMessage('2', 5, 5), /Meja 2 sudah punya 5 pesanan yang belum selesai/)
  assert.match(tableLimitMessage('2', 7, 5), /7 pesanan/)
  assert.equal(tableLimitMessage('2', 99, 0), null, '0 = tanpa batas')
})
