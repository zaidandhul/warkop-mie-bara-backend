-- Audit log staf: siapa mengubah status pesanan, status bayar, harga, atau ketersediaan menu, dan kapan.
-- entity_id = order_code (aksi pesanan) atau menu_items.id (aksi menu).
-- Diterapkan lewat migration runner: npm run db:migrate
USE kopi_miebara;

CREATE TABLE IF NOT EXISTS staff_audit_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  staff_id INT UNSIGNED NULL,
  action ENUM('order_status', 'order_payment', 'menu_price', 'menu_availability') NOT NULL,
  entity_id VARCHAR(80) NOT NULL,
  old_value VARCHAR(100) NULL,
  new_value VARCHAR(100) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_audit_staff FOREIGN KEY (staff_id)
    REFERENCES staff_users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  INDEX idx_audit_entity (entity_id, created_at),
  INDEX idx_audit_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
