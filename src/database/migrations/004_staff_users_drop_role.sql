-- Sistem role disederhanakan: hanya ada satu jenis akun staf (admin) yang boleh semua hal.
-- Kolom role (kasir/dapur) dihapus; akun yang sudah ada tetap dipertahankan.
USE kopi_miebara;

ALTER TABLE staff_users DROP COLUMN role;
