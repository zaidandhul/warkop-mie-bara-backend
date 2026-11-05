# Catatan proposal vs implementasi

Bahan untuk laporan akhir. Dokumen ini membandingkan rencana dalam proposal dengan sistem yang sudah dibangun
(rilis `v1.0.0-pre-hosting`), beserta alasan setiap perbedaan.

Ringkasan konteks proposal:
- warung dine-in dengan 10 meja dan tim 4 orang;
- pembayaran manual di kasir (tunai atau QRIS manual), tanpa payment gateway;
- di luar scope: delivery/take away, reservasi, dan multi-bahasa.

## 1. Fitur wajib dalam proposal

| Fitur proposal | Status | Implementasi |
|---|---|---|
| QR per meja | ✅ | Halaman `/admin/qr` mencetak satu QR per meja (`?tableNumber=N`). Jumlah meja diatur `TABLE_COUNT` (default 10) |
| Menu digital: pencarian, filter, sorting | ✅ | Pencarian nama dan deskripsi (tanpa beda huruf besar/kecil), filter kategori, urutan default/termurah/termahal/terlaris. Pilihan tersimpan saat pelanggan kembali dari keranjang |
| Kustomisasi + instruksi khusus | ✅ | Level pedas, varian, topping, dan catatan per item. Opsi divalidasi server terhadap data menu. Item mana yang punya level/topping masih menunggu keputusan pemilik |
| Keranjang | ✅ | Harga keranjang disamakan dengan menu terbaru setiap kali menu dimuat; item yang habis dikeluarkan dengan pemberitahuan |
| Konfirmasi + ID pesanan | ✅ | Kode pesanan `MB-<20 hex>` ditampilkan di Riwayat Pesanan (disimpan 24 jam di perangkat pelanggan), dengan halaman status per pesanan |
| Status Menunggu / Diproses / Siap | ✅ (diperluas) | Ditambah **Selesai** dan **Dibatalkan**. Halaman status pelanggan diperbarui otomatis dan berhenti memperbarui saat status final |
| KDS urutan FIFO | ✅ | Kanban staf mengurutkan pesanan paling lama di atas, diperbarui tiap 10 detik, dengan bunyi notifikasi untuk pesanan baru |
| Dashboard admin | ✅ | Kanban pesanan, kelola menu (habis/tersedia, harga), input pesanan kasir, laporan, QR meja, kelola staf |
| Laporan per pesanan/meja/waktu + ekspor Excel | ✅ | Ringkasan omzet, lunas/belum, per metode bayar, per meja, per jam, per hari, menu terlaris, daftar pesanan; ekspor `.xlsx` 6 sheet |

## 2. Perbedaan teknis dan alasannya

| Aspek | Implementasi | Alasan |
|---|---|---|
| Basis data | **MySQL 8** (kompatibel MariaDB 10.4) | Keputusan pemilik untuk tetap memakai MySQL. Data pesanan yang sudah ada berada di MySQL, dan tim sudah memakai Laragon/XAMPP. Integritas dijaga dengan CHECK constraint, foreign key, dan transaksi |
| Pembaruan realtime | **Polling**: kanban tiap 10 detik, status pelanggan tiap 5 detik. **Tanpa Socket.io** | Untuk 10 meja, jeda maksimal 10 detik masih memadai bagi dapur. Polling tidak butuh koneksi persisten, sehingga lebih tahan terhadap WiFi warung yang putus-sambung, lebih mudah di-hosting (cukup HTTP biasa di belakang proxy/CDN), dan lebih sederhana diuji. Polling berhenti saat tab tidak terlihat atau status sudah final, jadi bebannya kecil |
| Cache / antrean | **Tanpa Redis** | Keputusan pemilik. Volume satu warung tidak membutuhkan cache. Rate limit dan lockout login disimpan di memori proses, yang cukup untuk satu instance backend. Bila kelak berjalan di beberapa instance, keduanya perlu dipindah ke penyimpanan bersama |
| Pembayaran | **Manual di kasir** (tunai / QRIS manual); kasir menandai lunas di kanban | Sesuai proposal: tanpa payment gateway. Opsi "online" di API ditolak, supaya tidak ada pesanan yang tampak sudah dibayar padahal belum |
| Hosting / deployment | **Ditunda** | Target hosting (satu VPS, atau Vercel untuk frontend + VPS untuk backend) belum diputuskan pemilik. Semua pekerjaan yang tidak bergantung pada hosting sudah selesai; daftar sisanya ada di `BELUM-SELESAI.md` |
| Akun staf | **Satu jenis akun utama (admin)**, ditambah peran **staf** minimal | Awalnya hanya admin, sesuai keputusan menghapus peran kasir/dapur. Ditambahkan pembedaan minimal: hanya admin yang mengelola akun staf, sedangkan semua fitur operasional terbuka untuk semua staf |

## 3. Tambahan di luar proposal

Ditambahkan karena dibutuhkan agar sistem aman dan bisa dioperasikan:

| Tambahan | Alasan |
|---|---|
| Harga selalu dihitung ulang di server | Mencegah manipulasi harga dari browser pelanggan |
| Idempotency key pada pesanan | Klik dobel atau kirim ulang tidak membuat pesanan dobel |
| Status pembayaran (lunas tunai/QRIS, batalkan lunas) | Kasir perlu mencatat pesanan yang sudah dibayar; pesanan lunas tidak bisa dibatalkan |
| Input pesanan oleh kasir | Pelanggan yang memesan langsung di kasir tetap tercatat di sistem dan laporan |
| Batas 5 pesanan aktif per meja dan rate limit per perangkat | Mencegah spam pesanan palsu lewat QR |
| Audit log staf | Mencatat siapa mengubah status, pembayaran, harga, atau ketersediaan menu |
| Kelola staf (tambah, nonaktif, reset/ganti password) | Akun tidak perlu dikelola lewat database atau terminal |
| Keamanan: bcrypt, JWT HS256 di cookie httpOnly, lockout login, security header, validasi konfigurasi produksi | Standar minimum untuk aplikasi dengan login dan data pelanggan |
| Retensi nomor HP (`db:retention`) dan halaman kebijakan privasi | Data pribadi tidak disimpan selamanya |
| Migration runner, backup terverifikasi (`db:backup`) | Perubahan skema dan pencadangan bisa diulang dengan aman |
| Logger terstruktur | Jejak request dan error untuk penelusuran masalah |
| Pengujian: unit, integration (MySQL sungguhan), E2E Selenium, CI GitHub Actions | Setiap perubahan bisa diverifikasi otomatis |

## 4. Fitur yang sengaja disembunyikan

| Fitur | Alasan |
|---|---|
| Tab Reservasi | Di luar scope proposal |
| Pilihan bahasa (EN) | Di luar scope proposal (aplikasi berbahasa Indonesia) |
| Tombol "Masuk" pelanggan | Pelanggan memesan tanpa akun; tombolnya tidak berfungsi |
| Opsi QRIS online di halaman bayar | Tidak ada payment gateway; QRIS dibayar manual di kasir |

## 5. Pengujian (per rilis `v1.0.0-pre-hosting`)

| Jenis | Cakupan |
|---|---|
| Unit (backend) | Kalkulasi harga, validasi pesanan, normalisasi, waktu WIB, transisi status, peringkat terlaris, batas per meja, keamanan (JWT, lockout, env, logging) |
| Integration (backend) | Migration runner (database kosong dan database lama), retensi, backup, dijalankan terhadap MySQL sungguhan |
| Unit (frontend) | Filter/urutan menu, harga, sinkronisasi keranjang |
| E2E (Selenium) | Alur pelanggan, kanban, pembayaran, QR, pesanan kasir, laporan + Excel, batas per meja, filter menu, audit log, kelola staf, riwayat, keamanan API |
| CI | Lint, unit, integration (MySQL 8), build frontend pada setiap pull request |
