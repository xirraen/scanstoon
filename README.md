# Scanstoon

Telegram Mini App untuk katalog dan tracker komik orisinal. **MVP live Cloudflare C5**.

## Fitur MVP
- Katalog responsif, filter tipe, pencarian dan sorting.
- Detail, genre dan daftar chapter untuk karya contoh orisinal.
- Reader preview vertikal berbasis visual orisinal (bukan materi komik berhak cipta).
- Bookmark dan histori lokal untuk pengunjung browser (tanpa Telegram).
- Bookmark dan progres baca tersinkron lewat Telegram Mini App CloudStorage; endpoint D1 lama tetap tersedia untuk kompatibilitas.
- Validasi HMAC-SHA256 Telegram initData pada server.
- Webhook Telegram dengan secret header, perintah /start, /app, /help.

## Scanstoon Aurora (UI 0.2)

Rancangan aplikasi mobile dibuat secara independen dengan mengambil **pola interaksi umum** dari video referensi, tanpa menyalin merek, materi komik, aset, atau kode pihak ketiga.

- Tab **Beranda**, **Katalog**, **Pustaka**, **Aktivitas**, dan **Akun** yang dioptimalkan untuk Telegram Mini App.
- Filter katalog berdasarkan format, genre, status serial, pengurutan, serta opsi tampilan grid/daftar.
- Beranda dengan pintasan **lanjut baca** dari progres tersimpan dan akses aktivitas harian.
- Check-in membaca harian serta tampilan 7 hari dan streak. Check-in tidak menghasilkan uang, poin, atau hadiah finansial.
- Check-in disinkronkan lewat **Telegram CloudStorage** jika tersedia, dan tersimpan di localStorage saat dibuka lewat browser.
- Tema terang/gelap, progres scroll reader, dan ekspor cadangan JSON berisi bookmark serta progres. Ekspor belum mendukung impor otomatis.
- Ilustrasi seed tetap placeholder orisinal; tidak disertakan media berhak cipta dari aplikasi referensi.

## Scanstoon Spectrum (UI v0.3)

Pembaruan desain yang langsung digunakan oleh Telegram Mini App, tanpa mengubah kontrak API Worker maupun skema D1:

- Beranda dengan ucapan pembuka, pintasan pencarian, banner editorial, dan akses cepat pustaka/aktivitas.
- Sistem visual navy OLED dengan aksen cyan–magenta; kartu katalog berlabel status **ongoing / tamat / hiatus**.
- Navigasi mobile **floating bottom bar**, jarak aman untuk gesture area perangkat, dan interaksi touch-friendly.
- Integrasi Telegram WebApp: **BackButton**, perluasan layar, header/background color, dan haptic feedback dengan fallback browser.
- Tampilan katalog, detail, pembaca vertikal, tema terang/gelap, ekspor pustaka, dan penyimpanan Telegram tetap kompatibel.
- Menghormati preferensi `prefers-reduced-motion` dan menyediakan indikator fokus untuk navigasi keyboard.

**Catatan:** Kartu sampul menggunakan bentuk dan gradasi CSS orisinal, bukan gambar komik berhak cipta. Semua layanan data dan konfigurasi bot tetap mengikuti dokumentasi sebelumnya.

## Scanstoon Profile Sheet (UI v0.4)

Halaman Akun ditata ulang berdasarkan **struktur pengalaman** video referensi yang diberikan pengguna (bukan menyalin merek, aset visual atau kode pihak lain).

- Tampilan profil mobile menggunakan susunan `bottom sheet`, avatar monogram Scanstoon, nama dan username Telegram (jika tersedia), tombol tutup, kartu level berbasis **jumlah judul dalam riwayat baca**, dan statistik bookmark/riwayat nyata. Tidak menampilkan mata uang semu.
- Banner Scanstoon bergaya orisinal dan 12 pintasan cepat: Aktivitas, Katalog, Bagikan, Koleksi, Favorit, Genre, Riwayat, Pencapaian, Pengaturan, Terbaru, Bantuan, Tentang.
- Daftar informasi profil, status notifikasi (tanpa angka yang dibuat-buat), bookmark, riwayat baca, bagikan, pengaturan, ekspor data dan bantuan melalui bot.
- Pilihan tema **Sistem, Terang, Gelap**; mengikuti preferensi OS saat memilih Sistem.
- Pembagian tautan menggunakan Web Share API atau Clipboard API jika tersedia; fallback berupa petunjuk URL.
- Data profil Telegram menggunakan `initDataUnsafe.user` hanya untuk tampilan; pengesahan identitas untuk API privat tetap pada server menggunakan `initData`.
- Integrasi Telegram CloudStorage dan alur pembaca tetap tidak diubah. Tidak membuat fitur poin, notifikasi, toko, transaksi, atau bonus fiktif.

## Scanstoon Profile v0.5 (pencapaian nyata)

Penyempurnaan dari Profile Sheet v0.4:
- **Pencapaian** bukan lagi tautan umum ke Aktivitas: 6 milestone ditampilkan di panel profil menggunakan riwayat judul, bookmark, hari check-in, dan streak yang benar-benar tersedia; tidak ada poin, mata uang virtual atau reward finansial.
- Pintasan **Favorit** membuka bagian bookmark di Pustaka, sedangkan **Riwayat** menuju bagian histori yang terpisah.
- Saat mode sistem/terang/gelap berubah, warna header, background dan bottom bar Telegram disesuaikan jika API Telegram tersedia.
- Pengujian antarmuka otomatis menguji panel milestone, anchor Favorit dan sinkronisasi tema Telegram.

## Stack
Cloudflare Workers + D1, HTML/CSS/JavaScript tanpa runtime dependency. MVP sengaja dibuat single Worker untuk memudahkan deploy langsung di C5. Rencana React/TypeScript dari whitepaper menjadi tahap refaktor berikutnya.

## Jalankan / deploy
Node 20+ dan Wrangler 4+.

\`\`\`bash
npm install
npm run check
npx wrangler d1 execute scanstoon-db --local --file=./migrations/0001_init.sql
npx wrangler d1 execute scanstoon-db --local --file=./migrations/0002_seed.sql
npm run dev
npm run deploy
\`\`\`

Gunakan migrasi \`--remote\` untuk database production dan pastikan akun Cloudflare **C5** dipilih. Set secret secara manual di akun C5:
\`\`\`bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
\`\`\`
Set \`APP_URL\` ke URL produksi melalui konfigurasi Wrangler bila ingin tombol Mini App di webhook. Konfigurasikan Telegram BotFather dan Telegram setWebhook dengan secret yang sama. **Jangan pernah commit token bot**.

**Keamanan:** Endpoint baca katalog bersifat publik, penyimpanan user memerlukan Telegram initData valid dan tidak menerima user ID dari klien. Tidak ada token demo yang membuka API privat.

**Catatan konten:** Semua data di migration seed adalah judul fiksi orisinal khusus demonstrasi. Visual reader juga contoh orisinal, bukan chapter komik lain. Hanya gunakan materi yang dimiliki atau dilisensikan. R2 belum aktif di akun C5, sehingga storage media belum disiapkan.

## Telegram sebagai penyimpanan (fitur baru)
Media komik orisinal/berlisensi disimpan di channel Telegram privat. Referensi `file_id` tersimpan di D1 C5; bookmark dan progres baru milik pengguna Telegram disimpan melalui Telegram Mini App CloudStorage, bukan melalui endpoint D1 lama. Endpoint API lama dipertahankan demi kompatibilitas. Baca `TELEGRAM_STORAGE.md` untuk format unggahan dan konfigurasi bot. Sebelum bot dan secret disetel, mode preview tetap berjalan.

## Pemeriksaan otomatis

GitHub Actions memeriksa hasil build Worker dan pengamanan endpoint dengan `npm run check && node --test tests/*.test.mjs`.

## Bot Telegram

Bot aktif menggunakan `@ScanstoonBot` dengan webhook Cloudflare C5. Tombol menu Mini App dikonfigurasikan otomatis ke alamat Worker. Status publik yang aman untuk diperiksa adalah `/api/telegram/status` (tanpa token). Untuk input konten channel gunakan format di `TELEGRAM_STORAGE.md`.
