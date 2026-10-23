-- Akun staf untuk dashboard /admin. Password disimpan sebagai hash bcrypt.
-- Akun pertama dibuat dengan: npm run staff:create
USE kopi_miebara;

CREATE TABLE IF NOT EXISTS staff_users (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL,
  password_hash VARCHAR(100) NOT NULL,
  role ENUM('kasir', 'dapur') NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_staff_users_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
