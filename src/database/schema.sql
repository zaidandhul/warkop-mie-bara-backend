CREATE DATABASE IF NOT EXISTS mie_bara
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

USE mie_bara;

CREATE TABLE IF NOT EXISTS categories (
  id VARCHAR(60) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS toppings (
  id VARCHAR(60) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  price INT UNSIGNED NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  CHECK (price >= 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS menu_items (
  id VARCHAR(80) PRIMARY KEY,
  category_id VARCHAR(60) NOT NULL,
  name VARCHAR(160) NOT NULL,
  description TEXT NULL,
  price INT UNSIGNED NOT NULL,
  best_seller BOOLEAN NOT NULL DEFAULT FALSE,
  cold BOOLEAN NOT NULL DEFAULT FALSE,
  needs_price_check BOOLEAN NOT NULL DEFAULT FALSE,
  levels_json JSON NULL,
  options_json JSON NULL,
  allowed_toppings_json JSON NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  CONSTRAINT fk_menu_category FOREIGN KEY (category_id)
    REFERENCES categories(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CHECK (price >= 0),
  INDEX idx_menu_category_active (category_id, is_active, sort_order)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS app_settings (
  setting_key VARCHAR(60) PRIMARY KEY,
  setting_value INT NOT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_code VARCHAR(24) NOT NULL UNIQUE,
  table_number VARCHAR(30) NOT NULL,
  customer_name VARCHAR(100) NOT NULL,
  customer_phone VARCHAR(30) NULL,
  payment_method ENUM('online', 'cashier') NOT NULL,
  status ENUM('menunggu', 'diproses', 'siap', 'selesai', 'dibatalkan') NOT NULL DEFAULT 'menunggu',
  subtotal INT UNSIGNED NOT NULL,
  fee INT UNSIGNED NOT NULL DEFAULT 0,
  total INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CHECK (total = subtotal + fee),
  INDEX idx_orders_status_created (status, created_at),
  INDEX idx_orders_table_created (table_number, created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS order_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_id BIGINT UNSIGNED NOT NULL,
  menu_item_id VARCHAR(80) NULL,
  item_name VARCHAR(160) NOT NULL,
  qty SMALLINT UNSIGNED NOT NULL,
  level_value TINYINT UNSIGNED NULL,
  variant VARCHAR(100) NULL,
  note VARCHAR(250) NOT NULL DEFAULT '',
  toppings_snapshot JSON NOT NULL,
  unit_price INT UNSIGNED NOT NULL,
  line_total INT UNSIGNED NOT NULL,
  CONSTRAINT fk_order_items_order FOREIGN KEY (order_id)
    REFERENCES orders(id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_order_items_menu FOREIGN KEY (menu_item_id)
    REFERENCES menu_items(id) ON UPDATE CASCADE ON DELETE SET NULL,
  CHECK (qty > 0),
  CHECK (line_total = unit_price * qty),
  INDEX idx_order_items_order (order_id)
) ENGINE=InnoDB;
