-- Pembedaan minimal admin/staf dan pencabutan sesi.
-- is_admin: hanya admin yang boleh mengelola akun staf; semua fitur lain terbuka untuk semua staf.
--   Akun yang sudah ada menjadi admin (default TRUE), jadi tidak ada yang kehilangan akses.
-- session_version: dinaikkan saat password diganti/di-reset; token login lama (klaim v) jadi tidak berlaku.
-- Diterapkan lewat migration runner: npm run db:migrate
USE kopi_miebara;

ALTER TABLE staff_users
  ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT TRUE AFTER password_hash,
  ADD COLUMN session_version INT UNSIGNED NOT NULL DEFAULT 0 AFTER is_admin;
