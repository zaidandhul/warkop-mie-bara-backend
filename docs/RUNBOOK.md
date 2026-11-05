# Runbook operasional

Panduan harian untuk menjalankan dan merawat sistem Warkop Mie Bara. Semua perintah `npm run …` dijalankan
di folder `backend/` kecuali disebut lain. Konfigurasi dibaca dari `backend/.env`.

> Fase hosting belum dikerjakan: process manager, HTTPS, dan jadwal backup otomatis belum ada. Bagian
> "Start/stop" di bawah berlaku untuk menjalankan di satu komputer (laptop/PC kasir).

## 1. Start dan stop

| Langkah | Perintah |
|---|---|
| Nyalakan MySQL | Laragon → **Start All** (atau XAMPP → MySQL **Start**) |
| Backend | `cd backend && npm start` (atau `npm run dev` saat mengembangkan) |
| Frontend (pengembangan / LAN) | `cd frontend && npm run dev` |
| Cek kesehatan | buka `http://localhost:3000/api/health` → `{"status":"ok","database":"connected"}` |
| Stop | `Ctrl+C` di jendela backend dan frontend |

HP pelanggan dan tablet staf membuka alamat LAN frontend, misalnya `http://192.168.1.10:5173`. Alamat IP
ditampilkan Vite saat start, di baris `Network:`.

Log backend berupa JSON satu baris per request (method, path, status, durasi). Error 500 dicatat lengkap
dengan stack. Level log diatur dengan `LOG_LEVEL` (default `info`).

## 2. Akun staf

- **Akun admin pertama** (atau saat semua admin lupa password):
  ```bash
  npm run staff:create                      # interaktif, password tidak terlihat
  STAFF_PASSWORD='…' npm run staff:create -- --username admin2   # non-interaktif
  ```
  Akun dari CLI selalu **admin**.
- **Sehari-hari, lewat dashboard** (`/admin/staf`, khusus admin):
  - tambah staf (peran Staf atau Admin);
  - nonaktifkan / aktifkan;
  - jadikan admin / staf;
  - reset password (semua sesi staf itu langsung berakhir).
- **Ganti password sendiri:** klik nama di header dashboard → halaman **Akun saya**.
- **Aturan:** password minimal 8 karakter (maksimal 72 byte); tidak bisa menonaktifkan atau menurunkan diri sendiri; harus tersisa minimal satu admin aktif.
- Staf biasa bisa memakai semua fitur kecuali kelola staf.

## 3. Migrasi database

```bash
npm run db:backup            # selalu backup dulu
npm run db:migrate:status    # lihat migrasi yang BELUM diterapkan
npm run db:migrate           # terapkan
```

- Runner mencatat migrasi di tabel `schema_migrations`.
- Database kosong otomatis dibuat dari `src/database/schema.sql`.
- Database lama tanpa catatan: migrasi 001–006 dikenali dari efeknya dan ditandai `baseline` (tidak dijalankan ulang).
- Status **"⚠ file berubah setelah diterapkan"** berarti file migrasi diedit setelah dipakai. Jangan lakukan itu; buat migrasi baru.
- Bila migrasi gagal di tengah: MySQL sudah meng-commit perintah DDL sebelum titik gagal. Perbaiki struktur secara manual (atau pulihkan backup), lalu jalankan `npm run db:migrate` lagi.

**Membuat migrasi baru:**
1. Buat file `src/database/migrations/NNN_nama.sql` (nomor berikutnya, diawali `USE kopi_miebara;`).
2. Masukkan perubahan yang sama ke `schema.sql`.
3. Tambahkan pembatalannya ke simulasi database lama di `test/integration/migrator.test.js`.
4. Jalankan `npm run test:integration`.

## 4. Backup dan restore

**Backup manual:**
```bash
npm run db:backup
```
- Hasil: `src/database/dump/kopi_miebara_YYYY-MM-DD_HHmmss.sql` (jam WIB). Folder ini di-ignore git.
- Skrip memverifikasi bahwa file tidak kosong dan lengkap.
- Lokasi lain: `BACKUP_DIR=D:\backup npm run db:backup`. Bila `mysqldump` tidak ditemukan, isi `MYSQLDUMP_PATH`.
- File backup berisi **data pelanggan**: jangan dikirim ke luar komputer tanpa izin, dan jangan di-commit.
- Penjadwalan otomatis menyusul di fase hosting. Sampai saat itu, backup minimal setiap hari setelah tutup, dan simpan salinan di media lain (flashdisk/drive).

**Restore** (menimpa database dengan isi backup):
1. Hentikan backend.
2. Backup dulu keadaan sekarang: `npm run db:backup`.
3. Pulihkan. File backup memuat `CREATE DATABASE`/`USE kopi_miebara`:
   ```bash
   mysql -u root -p < src/database/dump/kopi_miebara_2026-11-05_120000.sql
   ```
   - Di Laragon, `mysql` ada di `C:\laragon\bin\mysql\mysql-8.0.30-winx64\bin\mysql.exe`.
   - Untuk memulihkan ke **database lain** (misalnya untuk diperiksa dulu), ganti nama database di file salinan sebelum mengimpor. Contoh di Git Bash: `sed 's/\bkopi_miebara\b/kopi_miebara_cek/g' backup.sql | mysql -u root -p`.
4. `npm run db:migrate:status` → pastikan semua migrasi sudah diterapkan; jalankan `npm run db:migrate` bila backup berasal dari versi lama.
5. Nyalakan backend dan cek `/api/health`.

## 5. Retensi data pribadi (nomor HP)

```bash
npm run db:retention -- --dry-run     # berapa pesanan yang akan dikosongkan nomor HP-nya
npm run db:retention                  # kosongkan nomor HP pesanan > PHONE_RETENTION_DAYS hari (default 90)
npm run db:retention -- --days 30     # sekali jalan dengan batas lain
```

- Hanya kolom nomor HP yang dikosongkan; total, item, status, dan laporan penjualan tidak berubah.
- Lama retensi masih menunggu keputusan pemilik (lihat `BELUM-SELESAI.md`).
- Belum dijadwalkan otomatis.

## 6. Mengubah jumlah meja dan mencetak ulang QR

1. Ubah `TABLE_COUNT` di `backend/.env` (1–99), lalu restart backend.
2. Buka dashboard → **QR Meja** (`/admin/qr`).
3. Isi **Alamat aplikasi pelanggan** dengan alamat yang bisa dibuka dari HP pelanggan (bukan `localhost`), misalnya `http://192.168.1.10:5173` atau domain produksi. Alamat ini tersimpan di browser tersebut.
4. Klik **Cetak**: kartu QR tersusun 2 kolom per halaman, tanpa header dashboard.
5. Uji satu QR dengan HP: halaman menu harus terbuka dengan nomor meja yang benar.

Alamat default QR bisa diatur lewat `VITE_PUBLIC_URL` di `frontend/.env`. Bila alamat server berubah (misalnya
pindah ke hosting), **semua QR harus dicetak ulang**.

## 7. Menu dan harga

- **Habis/tersedia dan ubah harga:** dashboard → **Menu**. Perubahan langsung berlaku dan dicatat di audit log.
- **Menu baru atau perubahan katalog:**
  1. Edit `src/data/menu.json`.
  2. `npm run db:seed`. Harga dan status tersedia menu yang sudah ada tidak ditimpa; pakai `npm run db:seed -- --force` bila memang ingin menimpanya dari `menu.json`, misalnya setelah harga dikonfirmasi pemilik.
  3. `npm run db:note-only` untuk menjaga camilan/minuman hanya menerima catatan.

## 8. Laporan

Dashboard → **Laporan**: pilih rentang tanggal (maksimal 92 hari), lalu **Ekspor Excel** untuk file `.xlsx`
(ringkasan, pesanan, per meja, per jam, per hari, menu terlaris). Omzet = semua pesanan yang tidak dibatalkan,
lunas maupun belum.

## 9. Penanganan masalah umum

| Gejala | Penyebab umum | Tindakan |
|---|---|---|
| Halaman menu: "Menu gagal dimuat" | Backend mati atau MySQL mati | Cek `/api/health`; nyalakan MySQL lalu backend |
| `/api/health` → 500 | MySQL mati / salah `MYSQL_*` | Nyalakan MySQL; cek `.env` |
| Backend tidak mau start: "JWT_SECRET wajib diisi" | `.env` belum lengkap | Isi `JWT_SECRET` (≥ 32 karakter acak, lihat `.env.example`) |
| Backend tidak mau start: "Konfigurasi produksi tidak aman" | `NODE_ENV=production` dengan `root`/password kosong/rahasia contoh | Pakai user MySQL khusus dan rahasia acak, atau hapus `NODE_ENV` di lokal |
| Staf tidak bisa login: "Terlalu banyak percobaan login" | 5 kali gagal dalam 15 menit dari perangkat yang sama | Tunggu sesuai pesan, atau restart backend (data lockout di memori) |
| Staf terlempar ke halaman login | Sesi 12 jam habis, password diganti/di-reset, atau akun dinonaktifkan | Login ulang; cek status akun di halaman Staf |
| Pelanggan: "Meja N sudah punya 5 pesanan yang belum selesai" | Pesanan lama di meja itu belum diselesaikan/dibatalkan | Selesaikan atau batalkan pesanan lama di kanban, atau input lewat kasir (tidak dibatasi). Batas: `MAX_ACTIVE_ORDERS_PER_TABLE` |
| Pelanggan: "Terlalu banyak pesanan dari perangkat ini" | `ORDER_RATE_LIMIT` per IP tercapai (banyak HP di belakang satu IP publik) | Naikkan `ORDER_RATE_LIMIT`, atau input lewat kasir |
| Kanban tidak berbunyi | Browser memblokir suara sebelum ada interaksi | Klik **Aktifkan suara** setelah membuka ulang halaman |
| Tombol **Batalkan** tidak muncul di kartu pesanan | Pesanan sudah ditandai lunas (aturan: pesanan lunas tidak bisa dibatalkan) | Bila tanda lunas salah, klik **Batalkan lunas** dulu, lalu batalkan |
| `npm run db:backup`: "mysqldump tidak bisa dijalankan" | `mysqldump` tidak ditemukan | Isi `MYSQLDUMP_PATH` dengan path lengkap `mysqldump.exe` |
| `npm run db:migrate` gagal | Struktur database berbeda dari harapan | Lihat pesan; pulihkan backup terakhir atau perbaiki manual, lalu ulangi |
