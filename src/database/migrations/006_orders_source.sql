-- Asal pesanan: 'pelanggan' (QR meja) atau 'kasir' (diinput staf dari dashboard), dan staf pembuatnya.
USE kopi_miebara;

ALTER TABLE orders
  ADD COLUMN source ENUM('pelanggan', 'kasir') NOT NULL DEFAULT 'pelanggan' AFTER payment_method,
  ADD COLUMN created_by_staff_id INT UNSIGNED NULL DEFAULT NULL AFTER source,
  ADD CONSTRAINT fk_orders_created_by FOREIGN KEY (created_by_staff_id)
    REFERENCES staff_users(id) ON UPDATE CASCADE ON DELETE SET NULL;
