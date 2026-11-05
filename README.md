# Warkop Mie Bara — Backend

REST API untuk pemesanan lewat QR meja di Warkop Mie Bara (dine-in, bayar di kasir). Melayani:

- **Pelanggan** (tanpa login): melihat menu, membuat pesanan, melihat status pesanan.
- **Staf** (login): kanban pesanan, pembayaran, input pesanan kasir, kelola menu, laporan penjualan, kelola staf.

Frontend ada di repo terpisah: [warkop-mie-bara-frontend](https://github.com/zaidandhul/warkop-mie-bara-frontend).

## Stack

- Node.js **>= 22**, JavaScript ESM tanpa build step
- Express 5, mysql2 (MySQL 8 / MariaDB 10.4+)
- Login staf: bcryptjs + JWT (jsonwebtoken) di cookie httpOnly
- Log: pino (JSON satu baris per kejadian)
- Test: `node:test` (unit dan integration), ESLint; E2E ada di repo frontend

## Setup lokal

Langkah lengkap dari nol (termasuk MySQL, database uji, dan E2E): [docs/SETUP-LAPTOP-BARU.md](docs/SETUP-LAPTOP-BARU.md).

Singkatnya:

```bash
npm install
cp .env.example .env          # isi MYSQL_* dan JWT_SECRET
npm run db:migrate            # membuat/memperbarui skema (database kosong -> schema.sql)
npm run db:seed               # isi kategori, menu, topping, pengaturan dari src/data/menu.json
npm run db:note-only          # minuman/camilan hanya menerima catatan (sesuai keputusan pemilik)
npm run staff:create          # akun admin pertama
npm run dev                   # API di http://localhost:3000/api
```

Cek: `GET http://localhost:3000/api/health` → `{"status":"ok","database":"connected"}`.

## Konfigurasi (`.env`)

Salin dari `.env.example`. **Jangan pernah commit `.env`.**

| Variabel | Default | Fungsi |
|---|---|---|
| `PORT` | `3000` | Port HTTP API |
| `FRONTEND_ORIGIN` | `http://localhost:5173` | Satu origin yang diizinkan CORS (dengan credentials) |
| `MYSQL_HOST` / `MYSQL_PORT` | `127.0.0.1` / `3306` | Server MySQL |
| `MYSQL_USER` / `MYSQL_PASSWORD` | `root` / kosong | Akun MySQL. Di produksi wajib user khusus aplikasi dengan password |
| `MYSQL_DATABASE` | `kopi_miebara` | Nama database |
| `JWT_SECRET` | — (wajib) | Rahasia JWT login staf, minimal 32 karakter acak. Server tidak mau start tanpa ini |
| `COOKIE_SECURE` | `false` | `true` hanya bila diakses lewat HTTPS |
| `TABLE_COUNT` | `10` | Jumlah meja (validasi nomor meja dan QR) |
| `ORDER_RATE_LIMIT` | `100` | Pesanan pelanggan per IP per 10 menit; `0` = tanpa batas |
| `MAX_ACTIVE_ORDERS_PER_TABLE` | `5` | Pesanan pelanggan yang belum selesai/dibatalkan per meja per hari (WIB); `0` = tanpa batas. Pesanan kasir tidak dihitung |
| `TRUST_PROXY` | `loopback` | Proxy yang dipercaya untuk `X-Forwarded-For` (lihat `trust proxy` Express) |
| `LOG_LEVEL` | `info` | Level log pino |
| `PHONE_RETENTION_DAYS` | `90` | Umur pesanan sebelum nomor HP dikosongkan oleh `db:retention` |
| `MYSQLDUMP_PATH` | otomatis | Lokasi `mysqldump` untuk `db:backup` |
| `BACKUP_DIR` | `src/database/dump/` | Folder hasil `db:backup` |
| `NODE_ENV` | — | `production` mengaktifkan pemeriksaan konfigurasi saat start: server menolak jalan bila `JWT_SECRET` kosong/pendek/nilai contoh, `MYSQL_USER` kosong atau `root`, atau `MYSQL_PASSWORD` kosong |

`.env.test` (untuk test E2E, dari `.env.test.example`) menimpa sebagian nilai: `PORT=3001`, `MYSQL_DATABASE=kopi_miebara_test`, `FRONTEND_ORIGIN=http://localhost:5174`, `ORDER_RATE_LIMIT=0`.

## Script npm

| Script | Fungsi |
|---|---|
| `dev` / `start` | Jalankan API (dev: restart otomatis saat file berubah) |
| `db:migrate` / `db:migrate:status` | Terapkan migrasi yang belum tercatat / tampilkan status (tabel `schema_migrations`) |
| `db:seed` | Upsert menu dari `src/data/menu.json`. Harga dan status tersedia menu lama tidak ditimpa, kecuali `-- --force` |
| `db:note-only` | Kosongkan opsi level/varian/topping untuk camilan dan minuman |
| `db:food-options` | Sinkronkan opsi level/topping kategori `special` dan `bara-nusantara` dari `menu.json` |
| `db:backup` | Backup database dengan mysqldump ke file bertanggal, lalu verifikasi |
| `db:retention` | Kosongkan nomor HP pesanan lama (`-- --dry-run` hanya menghitung, `-- --days N`) |
| `staff:create` | Buat akun admin (interaktif, atau `STAFF_PASSWORD=... npm run staff:create -- --username nama`) |
| `dev:test`, `db:test:setup`, `staff:create:test` | Versi untuk database uji (`.env.test`), dipakai test E2E |
| `test` | Unit test |
| `test:integration` | Integration test; membuat dan menghapus database sementara `mb_it_*_test` |
| `lint` | ESLint |

## Struktur

```
src/
  server.js            rute Express dan middleware
  config/env.js        pemeriksaan konfigurasi produksi
  db.js                pool mysql2 (UTC) dan withTransaction()
  logger.js            logger pino
  middleware/          auth, rate limit, security header, request log, error handler
  services/            logika per fitur (orders, orderRules, menu, admin, staff, audit, reports, backup, retention, auth)
  database/
    schema.sql         struktur lengkap (sumber kebenaran)
    migrations/        NNN_nama.sql, diterapkan oleh migrator.js
    migrator.js        migration runner
    dump/              backup lokal (di-ignore, berisi data pelanggan)
  scripts/             skrip CLI npm
  data/menu.json       isi menu untuk seed
test/unit, test/integration
docs/                  OpenAPI, runbook, setup, catatan proposal, daftar belum selesai
```

## Aturan penting

- **Harga selalu dihitung ulang di server.** Harga/total dari klien diabaikan.
- Uang dalam Rupiah bilangan bulat; waktu disimpan UTC, batas hari memakai WIB (`src/utils/time.js`).
- Pesan error API dalam Bahasa Indonesia, dikembalikan sebagai `{ "error": "..." }`.
- Setiap migrasi baru juga dimasukkan ke `schema.sql`; migrasi yang sudah diterapkan tidak diubah.

## Dokumentasi lain

- [docs/openapi.yaml](docs/openapi.yaml): semua endpoint
- [docs/RUNBOOK.md](docs/RUNBOOK.md): operasional harian dan penanganan masalah
- [docs/SETUP-LAPTOP-BARU.md](docs/SETUP-LAPTOP-BARU.md): dari clone sampai E2E lulus
- [docs/CATATAN-PROPOSAL.md](docs/CATATAN-PROPOSAL.md): perbedaan proposal dan implementasi
- [docs/BELUM-SELESAI.md](docs/BELUM-SELESAI.md): pekerjaan fase hosting dan keputusan yang menunggu pemilik
