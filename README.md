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
