-- Status pembayaran di kasir: kapan lunas, metodenya (tunai / QRIS manual), dan staf yang mencatat.
-- paid_at dan paid_method selalu terisi atau kosong bersamaan (chk_orders_paid).
USE kopi_miebara;

ALTER TABLE orders
  ADD COLUMN paid_at TIMESTAMP NULL DEFAULT NULL AFTER total,
  ADD COLUMN paid_method ENUM('tunai', 'qris_manual') NULL DEFAULT NULL AFTER paid_at,
  ADD COLUMN paid_by_staff_id INT UNSIGNED NULL DEFAULT NULL AFTER paid_method,
  ADD CONSTRAINT chk_orders_paid CHECK ((paid_at IS NULL) = (paid_method IS NULL)),
  ADD CONSTRAINT fk_orders_paid_by FOREIGN KEY (paid_by_staff_id)
    REFERENCES staff_users(id) ON UPDATE CASCADE ON DELETE SET NULL;
