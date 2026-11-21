# Belum selesai

Per rilis `v1.0.0-pre-hosting` (2026-11-05). Semua pekerjaan yang tidak bergantung pada hosting sudah selesai.
Dokumen ini berisi pekerjaan fase hosting, keputusan yang menunggu pemilik, dan tindak lanjut teknis.

## 1. Keputusan yang menunggu pemilik

### a. Biaya level dan biaya pesanan
- Harga 16 item yang sebelumnya ditandai `needs_price_check` sudah dicocokkan dengan foto menu dan penandanya dihapus.
- Opsi level dan topping sekarang ditentukan per item. Nasi, Sambal Penyet, Tempe Goreng, dan Tahu Goreng hanya menerima catatan.
- **Belum diputuskan:** apakah level menambah harga (sekarang `levelPriceStep = 0`) dan apakah ada biaya lain per pesanan (sekarang `otherFee = 0`).

### b. Lama penyimpanan nomor HP pelanggan
- **Saat ini:** default 90 hari (`PHONE_RETENTION_DAYS`).
- **Yang perlu diputuskan:** lama retensi yang sesuai kebijakan privasi, dan apakah pembersihan dijadwalkan otomatis (lihat bagian 2).

### c. Target hosting dan alamat publik
- **Pilihan:** satu VPS untuk frontend dan backend, atau Vercel untuk frontend ditambah VPS untuk backend.
- **Juga perlu:** domain atau alamat yang akan dicetak di QR meja.

## 2. Pekerjaan fase hosting (menunggu keputusan 1c)

| Pekerjaan | Catatan |
|---|---|
| Penyajian frontend produksi | `npm run build` lalu sajikan `dist/` lewat web server/CDN, dengan reverse proxy `/api` ke backend. Fallback SPA: semua route ke `index.html` |
| HTTPS | Lalu set `COOKIE_SECURE=true` |
| Process manager / auto-restart | Misalnya systemd, PM2, atau NSSM di Windows |
| Konfigurasi produksi | `NODE_ENV=production`, `JWT_SECRET` baru yang acak, user MySQL khusus aplikasi (bukan root) dengan hak minimum, `FRONTEND_ORIGIN` sesuai domain, `TRUST_PROXY` sesuai topologi proxy |
| CSP halaman frontend | API sudah mengirim header keamanan. CSP untuk HTML/JS frontend diatur di server yang menyajikan `dist/` |
| Rate limit di balik NAT | Bila backend di VPS, semua HP di WiFi warung bisa berbagi satu IP publik. Tinjau `ORDER_RATE_LIMIT` (default 100/10 menit) setelah melihat trafik nyata |
| Backup terjadwal | Jadwalkan `npm run db:backup` (minimal harian), salin ke luar server, dan uji restore berkala (`RUNBOOK.md` §4) |
| Retensi terjadwal | Jadwalkan `npm run db:retention` (misalnya mingguan) setelah keputusan 1c |
| Log | Tampung stdout JSON pino (journald/file + rotasi) dan pantau error 500 |
| Monitoring | Cek `/api/health` berkala; beri peringatan bila gagal |
| Cetak ulang QR | Setelah alamat publik final, cetak ulang semua QR dari `/admin/qr` |
| Akun staf produksi | Buat akun admin di database produksi (`npm run staff:create`), lalu akun staf lewat dashboard |

## 3. Tindak lanjut teknis

| Item | Kapan | Catatan |
|---|---|---|
| Temuan `npm audit` **moderate** di alat dev: `minimatch` (di ESLint, kedua repo) dan `glob`/`minimatch` (di mocha, frontend) | Mulai **~11 November 2026** | Versi tertambal (`minimatch` 11.0.1+, `glob` 14.0.2+) baru dirilis akhir Oktober 2026, dan tidak dipakai sebelum berumur 2 minggu. Setelah itu tambahkan `overrides` untuk ESLint dan mocha (atau upgrade bila mereka sudah memakai versi tertambal), lalu jalankan lint, unit, dan E2E. Tidak ada temuan high; dependency runtime backend 0 temuan |
| Rate limit dan lockout login di memori | Bila backend berjalan lebih dari satu instance | Pindahkan ke penyimpanan bersama (tabel MySQL atau Redis) |
| E2E di CI | Opsional | Butuh kedua repo, MySQL berisi database uji, Chrome, dan akun admin uji dalam satu job. Saat ini E2E dijalankan lokal |
| Realtime | Bila jeda 10 detik di kanban dirasa kurang | Ganti polling dengan Server-Sent Events atau WebSocket |
| Riwayat pesanan pelanggan | Bila diperlukan lintas perangkat | Saat ini hanya di perangkat yang memesan (localStorage, 24 jam) |
