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
- Check-in membaca harian serta tampilan 7 hari dan streak. Check-in tidak menghasilkan uang atau hadiah finansial. Sejak v0.6, check-in menghasilkan poin aktivitas internal yang tidak bisa dicairkan.
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

## Paspor .toon Premium (v0.6)

- Profil: kartu **Poin** dihitung sebagai 10 poin per judul yang ada pada riwayat baca dan 2 poin per hari check-in. Poin bersifat indikator aktivitas, **bukan mata uang** yang bisa dicairkan.
- Kartu **Stars dipakai** adalah total **Telegram Stars yang telah dibayarkan ke Scanstoon** (diverifikasi lewat D1). Bukan saldo Telegram Stars pengguna, karena saldo pribadi tidak tersedia melalui Bot API.
- **Paspor .toon** menggantikan pintasan Pengaturan. Detail Paspor menampilkan badge, nomor paspor setelah pembelian, pilihan Stars dan persetujuan syarat.
- Pembelian Paspor digital di Mini App menggunakan **Telegram Stars saja (XTR)**. Telegram melarang pembayaran TON langsung atau mata uang lain untuk barang digital di Mini Apps; karena itu rencana pembayaran US$5 via TON tidak ditawarkan pada checkout Telegram.
- Harga bawaan **250 XTR**, bukan konversi tetap ke US$5; operator dapat mengubahnya memakai variabel lingkungan `PASSPORT_STARS_PRICE` (integer 1–10.000). **Jangan mengaktifkan penjualan sebelum menetapkan harga dan memastikan kesiapan dukungan/refund.**
- Penjualan hanya aktif jika `PASSPORT_SALES_ENABLED=true` ditetapkan di binding Cloudflare. Default: **nonaktif**, sehingga tidak dapat menagih pengguna secara tak sengaja. Pengguna dapat melihat detail Paspor tanpa pembelian.
- Migrasi terlebih dahulu: `migrations/0004_passport_stars.sql` pada D1 database produksi. Tabel pesanan memiliki idempotensi `telegram_payment_charge_id` unik. Server memvalidasi `initData`, mengeluarkan invoice `createInvoiceLink`, memverifikasi `pre_checkout_query`, dan hanya mengaktifkan Premium saat `successful_payment` bertanda tangan dari webhook Telegram.
- Badge Premium dan Paspor berlaku selama layanan Scanstoon berjalan; ini **bukan Telegram Premium resmi**, tidak termasuk konten komik berbayar dan bukan NFT atau token.
- Bot menerima `/terms` serta `/paysupport`; kanal operator untuk sengketa melalui [GitHub Issues](https://github.com/xirraen/scanstoon/issues). Pemilik harus merespons sengketa dan refund.
- Tidak ada metode pembayaran blockchain di UI; wallet TON dapat ditambahkan untuk fitur blockchain terpisah dengan TON Connect, namun **bukan** untuk Premium digital Telegram.

## Scanstoon v0.7 — kesiapan operasional Paspor .toon

Penjualan **tetap nonaktif** secara default, dan baru bisa dipakai setelah operator menetapkan **ketiga** variabel Cloudflare berikut: `PASSPORT_SALES_ENABLED=true`, `PASSPORT_STARS_PRICE=<integer 1–10000>`, dan `PASSPORT_SUPPORT_CHAT_ID=<Telegram chat ID numerik admin/support>`. Harga 250 Stars pada UI bila belum diatur hanya **indikatif**, bukan konversi US$5.

- Nomor Paspor publik dihasilkan dari **HMAC** dengan server-side secret; tidak mengungkap ID Telegram pengguna.
- Hanya satu invoice aktif per user; checkout terjaga dari balapan persetujuan ganda. `pre_checkout_query` **ditolak** jika penjualan dihentikan.
- Pembayaran `successful_payment` dan `refunded_payment` diproses dengan idempotensi dan rekonsiliasi berbasis `telegram_payment_charge_id`; refund mencabut akses jika tidak ada pembayaran lain yang valid. Stars dipakai = pembayaran belum di-refund.
- Tiket dukungan **privat** via Telegram `/paysupport` lalu `/ticket PS-XXXXXXXXXXXX keluhan`; operator menerima pemberitahuan jika chat dukungan dikonfigurasi. Tidak perlu mempublikasikan data pembayaran ke GitHub Issues.
- Bot webhook harus menerima `message`, `channel_post`, dan **`pre_checkout_query`**. Bootstrap Worker dapat merekonsiliasi `allowed_updates` saat dijalankan lewat temporary Cron Trigger.
- Migrasi `migrations/0005_passport_operations.sql` **wajib dijalankan sebelum deploy** kode v0.7. Kode yang dijalankan tanpa migrasi ini dapat mengembalikan HTTP 500 untuk fitur Paspor.
- Tampilan Profil pada layar mobile menyembunyikan header situs duplikat supaya tidak bertabrakan dengan chrome native Telegram. Panel menampilkan tautan bantuan privat.
- **Tidak mengaktifkan pembayaran TON** untuk Premium digital dalam Telegram Mini App. Refund dilakukan melalui `refundStarPayment` menggunakan receipt yang sah; proses admin memerlukan verifikasi identitas transaksi terlebih dahulu.

Detail kesiapan produksi, migrasi, prosedur support, dan panduan refund di [docs/payments-ops.md](docs/payments-ops.md).

## Scanstoon v0.8 — satu tampilan untuk seluruh jalur masuk Telegram

Perbaikan regresi berdasarkan video pengguna yang menunjukkan dua rute masuk: tombol **Buka Scanstoon** pada chat bot dan **Buka Aplikasi** pada profil bot.

- Tombol chat bot dan menu bot memakai **URL kanonis** `https://scanstoon.ikomik-core.workers.dev/`. Bootstrap menu tidak lagi melewatkan pemeriksaan jika status sebelumnya `ok`; menu lama diperbarui bila masih menunjuk ke URL berbeda.
- HTML utama memakai `Cache-Control: no-store` dan header `X-Scanstoon-Release: 0.8.0`, agar WebView tidak mempertahankan versi tampilan lama. Semua rute frontend menerima build HTML yang identik.
- Pada **Telegram mobile**, header web tambahan dihilangkan pada **seluruh halaman**, bukan hanya halaman Profil. Navigasi bawah dan padding safe-area tetap dipertahankan.
- Tema default dipatok dark seperti desain Scanstoon. Preferensi pengguna (`dark`, `light`, `system`) disinkronkan ke Telegram CloudStorage (`scs_pref_theme`, `scs_pref_view`) untuk konsistensi antar-jalur masuk. Saat memilih tema Sistem, WebApp menggunakan `Telegram.WebApp.colorScheme` bila tersedia.
- Saat katalog lambat lebih dari 8 detik, tampil pesan status dan tombol **Coba lagi**; data yang akhirnya masuk tetap diproses. Loading dan navigasi stabil.
- Urutan bootstrap terjamin: webhook Telegram diverifikasi terlebih dahulu, baru URL menu bot direkonsiliasi, sehingga menu tidak dipublikasikan ketika webhook diblokir.
- Pengujian `tests/entrypoint.test.mjs` membandingkan hasil jalur Main Mini App dan tombol chat, sinkronisasi tema, header cache dan URL tombol `/start`.

**Penting:** Tombol **Buka Aplikasi** pada profil bot berasal dari **Main Mini App URL di @BotFather**, bukan dari Bot API. Operator harus memastikan BotFather > `/myapps` / pengaturan Main Mini App untuk `@ScanstoonBot` memiliki URL `https://scanstoon.ikomik-core.workers.dev/` (tanpa tautan lama). Perubahan otomatis melalui `setChatMenuButton` hanya mengatur **default menu bot**, bukan URL Main Mini App BotFather atau override menu per-chat. Kontrol sistem Telegram (X, panah, sheet) tidak dapat dihilangkan oleh aplikasi.

## Scanstoon v0.9 — startup tahan jaringan lambat

Video pengguna tanggal 1 November 2026 menunjukkan loading *“Menyiapkan dunia ceritamu…”* yang berulang. Penyebab pada frontend: seluruh halaman diblokir hingga `/api/comics` **dan** `/api/home` sama-sama selesai.

- Home, kartu pembuka, dan lima tab navigasi **langsung tampil** tanpa menunggu data jaringan.
- Satu permintaan awal `GET /api/comics?limit=48`; rekomendasi Home dihitung dari respons yang sama. Endpoint `/api/home` tetap tersedia untuk kompatibilitas API.
- Cache publik **terbatas 7 hari**, hanya daftar katalog umum (bukan data akun), disimpan pada `scanstoon_public_catalog_v1` di localStorage. Bila jaringan gagal, katalog terakhir tetap dapat dibuka dengan pemberitahuan jujur.
- Batas waktu 5,5 detik + `AbortController` jika didukung; tombol **Coba lagi** mengulang pemuatan tanpa mengunci tab.
- Mode browser dan kedua cara masuk Telegram (Main Mini App maupun tombol chat) tetap menggunakan sumber UI yang sama.
- Pengujian menggabungkan boot jaringan lambat/tidak pernah selesai, kegagalan network, cache, dan render sukses dalam mode Android/iOS.

Loading 4-kotak sebelum HTML dirender merupakan loading *native Telegram*; warna, logo, dan URL Main Mini App dikelola di BotFather. JavaScript web tidak dapat menyamakan seluruh kontrol native kedua jalur masuk.

## Scanstoon v0.9.1 — konsistensi mode peluncuran Telegram

Video pengguna menunjukkan tombol chat dan profil bot memicu dua jenis WebView native. Sumber masalah: tombol inline sebelumnya menggunakan `InlineKeyboardButton.web_app.url` (membuka inline Mini App / `requestWebView`), sedangkan **Buka Aplikasi** di profil memanggil Main Mini App (`requestMainWebView`).

Kini bot `/start`, `/app`, dan `/help` mengirim tombol **URL** ke `https://t.me/ScanstoonBot?startapp` (format Main Mini App resmi Telegram). Dengan begitu kedua tombol baru membuka Main Mini App yang sama. URL origin web produksi tetap `https://scanstoon.ikomik-core.workers.dev/`.

**Catatan:** pesan bot lama dengan tombol `web_app` tidak diperbarui secara otomatis. Buka chat `@ScanstoonBot` dan kirim `/start` lagi untuk mendapatkan tombol baru. Konfigurasi URL Main Mini App tetap berada di BotFather, tidak dapat diubah melalui Bot API. Kontrol / logo loading native Telegram berbeda antar versi klien, tetapi konten aplikasi dari backend adalah satu.

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
