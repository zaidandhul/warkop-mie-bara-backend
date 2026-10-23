-- Kunci idempotensi dari header Idempotency-Key (UUID yang dibuat frontend saat halaman pembayaran dibuka).
-- Request kedua dengan key yang sama mengembalikan pesanan lama, bukan membuat pesanan dobel.
-- Kolom NULL untuk pesanan lama; UNIQUE mengizinkan banyak NULL, jadi data lama tidak berubah.
USE kopi_miebara;

ALTER TABLE orders
  ADD COLUMN idempotency_key CHAR(36) NULL AFTER order_code,
  ADD UNIQUE KEY uq_orders_idempotency_key (idempotency_key);
