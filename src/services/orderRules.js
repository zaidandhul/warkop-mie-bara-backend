// Aturan pesanan tanpa database (bisa di-unit-test): validasi permintaan, validasi baris item,
// harga satuan, dan batas pesanan aktif per meja. Dipakai oleh createOrder di orders.js.
import { jsonArray } from '../utils/json.js'
import { TABLE_COUNT, normalizePhone, normalizeTableNumber } from '../utils/validation.js'

export const MAX_LINES = 50
export const MAX_QTY = 50
export const MAX_NOTE_LENGTH = 250

export function invalid(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode })
}

// Bagian pesanan yang tidak bergantung pada menu: item ada, meja, nama, nomor HP, metode bayar.
// staffId diisi untuk pesanan kasir: nama boleh kosong (dinamai "Meja N") dan metode selalu cashier.
export function validateOrderRequest(payload, { staffId = null } = {}) {
  if (!payload || !Array.isArray(payload.items) || payload.items.length === 0) {
    throw invalid('Pesanan harus berisi minimal satu item.')
  }
  if (payload.items.length > MAX_LINES) throw invalid(`Pesanan terlalu banyak item (maksimal ${MAX_LINES} baris).`)

  const tableNumber = normalizeTableNumber(payload.tableNumber)
  if (!tableNumber) throw invalid(`Nomor meja tidak valid. Gunakan angka 1 sampai ${TABLE_COUNT}.`)
  const customer = payload.customer && typeof payload.customer === 'object' ? payload.customer : {}
  const name = (typeof customer.name === 'string' ? customer.name.trim() : '') || (staffId ? `Meja ${tableNumber}` : '')
  if (name.length < 2 || name.length > 100) throw invalid('Nama pemesan wajib diisi, 2 sampai 100 karakter.')
  const phone = normalizePhone(typeof customer.phone === 'string' ? customer.phone : '')
  if (phone === null) {
    throw invalid('Nomor HP tidak valid. Gunakan nomor HP Indonesia yang diawali 08, +62, atau 62 (10–13 digit).')
  }
  // Hanya bayar di kasir. Tanpa payment gateway, pesanan 'online' akan terlihat seperti sudah dibayar
  // padahal belum; nilai 'online' di kolom hanya tersisa untuk data lama.
  const paymentMethod = staffId ? 'cashier' : payload.paymentMethod
  if (paymentMethod === 'online') throw invalid('Pembayaran online belum tersedia. Silakan bayar di kasir.')
  if (paymentMethod !== 'cashier') throw invalid('Metode pembayaran tidak valid.')
  return { items: payload.items, tableNumber, name, phone, paymentMethod }
}

// Satu baris pesanan terhadap baris menu_items (kolom JSON mentah). Level/varian/topping ditolak bila
// daftar di menu kosong atau tidak memuatnya. Mengembalikan { qty, level, variant, toppingIds, note }.
export function validateLine(menuItem, input) {
  if (!menuItem.is_active) throw invalid(`${menuItem.name} sedang tidak tersedia. Hapus dari keranjang lalu coba lagi.`)
  const qty = Number(input.qty)
  if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) throw invalid(`Jumlah ${menuItem.name} harus 1 sampai ${MAX_QTY}.`)

  const levels = jsonArray(menuItem.levels_json)
  const variants = jsonArray(menuItem.options_json)
  const allowedToppings = jsonArray(menuItem.allowed_toppings_json)
  const options = input.options && typeof input.options === 'object' ? input.options : {}

  const level = options.level == null || options.level === '' ? null : Number(options.level)
  if (level !== null) {
    if (!levels.length) throw invalid(`${menuItem.name} tidak memiliki pilihan level.`)
    if (!levels.includes(level)) {
      throw invalid(`Level ${options.level} tidak tersedia untuk ${menuItem.name}. Pilihan: ${levels.join(', ')}.`)
    }
  }
  const variant = options.variant == null || options.variant === '' ? null : String(options.variant)
  if (variant !== null) {
    if (!variants.length) throw invalid(`${menuItem.name} tidak memiliki pilihan varian.`)
    if (!variants.includes(variant)) throw invalid(`Varian "${variant}" tidak tersedia untuk ${menuItem.name}.`)
  }

  const toppingIds = options.toppings ?? []
  if (!Array.isArray(toppingIds) || toppingIds.some((id) => typeof id !== 'string') || new Set(toppingIds).size !== toppingIds.length) {
    throw invalid(`Daftar topping untuk ${menuItem.name} tidak valid.`)
  }
  if (toppingIds.length && !allowedToppings.length) throw invalid(`${menuItem.name} tidak bisa diberi topping.`)
  const notAllowed = toppingIds.find((id) => !allowedToppings.includes(id))
  if (notAllowed) throw invalid(`Topping "${notAllowed}" tidak tersedia untuk ${menuItem.name}.`)

  const note = typeof options.note === 'string' ? options.note.trim().slice(0, MAX_NOTE_LENGTH) : ''
  return { qty, level, variant, toppingIds, note }
}

// Harga satuan = harga dasar + (level - 1) * kenaikan per level + jumlah harga topping.
export function unitPrice({ basePrice, level = null, levelPriceStep = 0, toppings = [] }) {
  return basePrice + (level ? (level - 1) * levelPriceStep : 0) + toppings.reduce((sum, topping) => sum + topping.price, 0)
}

// Pesan 409 bila meja sudah mencapai batas pesanan aktif (max <= 0 = tanpa batas), selain itu null.
export function tableLimitMessage(tableNumber, active, max) {
  if (!(max > 0) || active < max) return null
  return `Meja ${tableNumber} sudah punya ${active} pesanan yang belum selesai. Tunggu pesanan sebelumnya selesai atau hubungi kasir.`
}
