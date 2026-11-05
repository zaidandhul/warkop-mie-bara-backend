# Setup di laptop baru: dari clone sampai E2E lulus

Panduan ini untuk Windows (Git Bash) dengan Laragon. Di Linux/macOS langkahnya sama; ganti Laragon dengan
MySQL 8 dari paket sistem.

Hasil akhir:
- backend dan frontend berjalan dengan database utama `kopi_miebara`;
- database uji `kopi_miebara_test` siap;
- semua test lulus (unit, integration, E2E).

## 0. Prasyarat

| Perangkat lunak | Versi | Catatan |
|---|---|---|
| Git | terbaru | Termasuk Git Bash |
| Node.js | **22 atau lebih baru** | `node -v` |
| MySQL | 8.0 (Laragon) atau MariaDB 10.4+ | Laragon: `C:\laragon\bin\mysql\...\bin` berisi `mysql` dan `mysqldump` |
| Google Chrome | terbaru | Untuk E2E. Selenium Manager mengunduh chromedriver otomatis (butuh internet sekali) |
| GitHub CLI (`gh`) | opsional | Untuk clone repo private dan membuat PR |

Kedua repo bersifat private: login GitHub dengan akun yang punya akses (`gh auth login`).

## 1. Clone kedua repo

```bash
mkdir -p /c/Projects/warkop-mie-bara && cd /c/Projects/warkop-mie-bara
gh repo clone zaidandhul/warkop-mie-bara-backend backend
gh repo clone zaidandhul/warkop-mie-bara-frontend frontend
(cd backend && npm install)
(cd frontend && npm install)
```

Set identitas commit **per repo** bila laptop dipakai bersama:
```bash
git -C backend config user.name "Nama"; git -C backend config user.email "email@contoh.com"
git -C frontend config user.name "Nama"; git -C frontend config user.email "email@contoh.com"
```

## 2. File yang tidak ada di git

Salin dari laptop lama, **jangan lewat chat/email publik**. Bila tidak ada, buat baru dari contohnya:

| File | Isi | Buat baru dari |
|---|---|---|
| `backend/.env` | Koneksi MySQL, `JWT_SECRET`, dll. | `backend/.env.example` |
| `backend/.env.test` | Override untuk database uji | `backend/.env.test.example` |
| `frontend/.env` | `VITE_API_URL=/api` (dan `VITE_PUBLIC_URL` opsional) | `frontend/.env.example` |
| `frontend/e2e/.env.e2e` | Akun admin uji dan alamat server uji | `frontend/e2e/.env.e2e.example` |
| `backend/src/database/dump/*.sql` | Backup database utama, berisi **data pelanggan** | `npm run db:backup` di laptop lama |

Membuat `JWT_SECRET` baru (≥ 32 karakter acak):
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

## 3. MySQL dan database utama

1. Jalankan Laragon → **Start All**. Pastikan MySQL berjalan di port 3306.
2. Isi `backend/.env`: `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE=kopi_miebara`, `JWT_SECRET`.
3. Pilih salah satu:

   **a. Memindahkan data dari laptop lama** (disarankan):
   ```bash
   cd backend
   /c/laragon/bin/mysql/mysql-8.0.30-winx64/bin/mysql -u root < src/database/dump/<file-backup-terbaru>.sql
   npm run db:migrate          # menerapkan migrasi yang mungkin belum ada di backup
   ```

   **b. Database baru kosong:**
   ```bash
   cd backend
   npm run db:migrate          # membuat database dan semua tabel dari schema.sql
   npm run db:seed             # kategori, menu, topping, pengaturan
   npm run db:note-only        # camilan/minuman hanya menerima catatan
   npm run staff:create        # akun admin pertama
   ```
4. Cek: `npm run db:migrate:status` → "Semua migrasi sudah diterapkan."

## 4. Menjalankan aplikasi

```bash
cd backend && npm run dev          # terminal 1: API http://localhost:3000/api
cd frontend && npm run dev         # terminal 2: http://localhost:5173
```

Buka `http://localhost:5173/?tableNumber=5` (pelanggan) dan `http://localhost:5173/admin/login` (staf).

## 5. Database uji dan akun E2E

```bash
cd backend
cp .env.test.example .env.test     # PORT=3001, MYSQL_DATABASE=kopi_miebara_test, ORDER_RATE_LIMIT=0
npm run db:test:setup              # MENGHAPUS dan membuat ulang kopi_miebara_test (menolak nama selain *_test)
```

Buat password uji acak, simpan di `frontend/e2e/.env.e2e`, lalu buat akunnya **dengan password yang sama**:

```bash
cd ../frontend
cp e2e/.env.e2e.example e2e/.env.e2e
PASS=$(node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))")
sed -i "s/^E2E_ADMIN_PASS=.*/E2E_ADMIN_PASS=$PASS/" e2e/.env.e2e
sed -i "s/^E2E_HEADLESS=.*/E2E_HEADLESS=true/" e2e/.env.e2e      # opsional: Chrome tanpa jendela
cd ../backend && STAFF_PASSWORD="$PASS" npm run staff:create:test -- --username e2e-admin
unset PASS
```

`e2e/.env.e2e` dan `.env.test` di-ignore git; jangan di-commit.

## 6. Menjalankan semua test

Tiga terminal untuk E2E:

```bash
cd backend && npm run dev:test     # terminal 1: API uji di :3001 (kopi_miebara_test)
cd frontend && npm run dev:e2e     # terminal 2: frontend uji di :5174
cd frontend && npm run test:e2e    # terminal 3: E2E Selenium (± 2 menit)
```

Test lain (tidak butuh server berjalan):

```bash
cd backend && npm run lint && npm test && npm run test:integration   # integration butuh MySQL
cd frontend && npm run lint && npm test && npm run build
```

Hasil yang diharapkan:
- semua lulus;
- E2E mencetak `N passing` tanpa `failing`;
- integration test membuat lalu menghapus database sementara `mb_it_*_test`.

Pengaman E2E:
- test dibatalkan bila backend tidak melaporkan `testMode` (database harus berakhiran `_test`);
- pembersihan data hanya mau berjalan di `kopi_miebara_test`.

## 7. Masalah umum saat setup

| Gejala | Tindakan |
|---|---|
| `ECONNREFUSED 127.0.0.1:3306` | MySQL belum dinyalakan |
| `JWT_SECRET wajib diisi` | Isi `JWT_SECRET` di `backend/.env` |
| E2E: "Login admin uji gagal (401)" | Password di `e2e/.env.e2e` berbeda dengan akun `e2e-admin`. Ulangi langkah 5 (setelah `db:test:setup` akun harus dibuat lagi) |
| E2E: "tidak melaporkan testMode" | Backend uji tidak berjalan atau tidak memakai `.env.test`; jalankan `npm run dev:test` |
| E2E gagal di run pertama setelah `npm install` | Vite sedang mengoptimasi ulang dependency dan me-reload halaman; jalankan ulang test |
| `npm run db:backup`: mysqldump tidak ditemukan | Isi `MYSQLDUMP_PATH` di `backend/.env` |
