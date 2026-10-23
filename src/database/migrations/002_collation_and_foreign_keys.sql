-- Menyamakan collation semua tabel ke utf8mb4_general_ci (sama dengan schema.sql) dan memasang
-- foreign key yang hilang saat database diimpor dari dump phpMyAdmin.
-- Hanya mengubah struktur; isi data tidak berubah.
-- Kolom JSON (longtext utf8mb4_bin) sengaja tidak disentuh, jadi tidak memakai CONVERT TO CHARACTER SET.
-- Sebelum menjalankan, pastikan tidak ada data yatim (menu_items tanpa kategori, order_items tanpa
-- orders/menu_items), karena ADD CONSTRAINT FOREIGN KEY akan gagal.
USE kopi_miebara;

ALTER DATABASE kopi_miebara CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

ALTER TABLE toppings
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci,
  MODIFY id VARCHAR(60) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  MODIFY name VARCHAR(120) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL;

ALTER TABLE menu_items
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci,
  MODIFY id VARCHAR(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  MODIFY category_id VARCHAR(60) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  MODIFY name VARCHAR(160) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  MODIFY description TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL;

ALTER TABLE orders
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci,
  MODIFY order_code VARCHAR(24) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  MODIFY idempotency_key CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL,
  MODIFY table_number VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  MODIFY customer_name VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  MODIFY customer_phone VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL,
  MODIFY payment_method ENUM('online', 'cashier') CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  MODIFY status ENUM('menunggu', 'diproses', 'siap', 'selesai', 'dibatalkan')
    CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'menunggu';

ALTER TABLE order_items
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci,
  MODIFY menu_item_id VARCHAR(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL,
  MODIFY item_name VARCHAR(160) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  MODIFY variant VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL,
  MODIFY note VARCHAR(250) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL DEFAULT '';

ALTER TABLE menu_items
  ADD CONSTRAINT fk_menu_category FOREIGN KEY (category_id)
    REFERENCES categories(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE order_items
  ADD CONSTRAINT fk_order_items_order FOREIGN KEY (order_id)
    REFERENCES orders(id) ON UPDATE CASCADE ON DELETE CASCADE,
  ADD CONSTRAINT fk_order_items_menu FOREIGN KEY (menu_item_id)
    REFERENCES menu_items(id) ON UPDATE CASCADE ON DELETE SET NULL;
