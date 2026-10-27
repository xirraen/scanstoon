# Scanstoon: Telegram Storage

Telegram digunakan untuk dua jenis penyimpanan:
- **Channel Telegram privat**: file gambar per halaman (hanya karya orisinal / konten yang memiliki izin distribusi).
- **Telegram Mini App CloudStorage**: bookmark `scs_b_<slug>` dan progres `scs_h_<slug>` per pengguna.
- **Cloudflare D1 C5**: katalog dan metadata referensi `file_id`, bukan blob gambar.

### Konfigurasi
1. Buat bot di BotFather dan channel privat. Jadikan bot administrator channel dengan izin posting.
2. Jalankan `npx wrangler d1 execute scanstoon-db --remote --file=./migrations/0003_telegram_media.sql` pada akun C5 (telah diterapkan pada 28 Oktober 2026).
3. Tambahkan secrets di Worker `scanstoon`: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_CHANNEL_ID` (ID numerik -100...), dan `MEDIA_SIGNING_SECRET` (random hex panjang). Jangan commit nilainya.
4. Daftarkan webhook melalui Bot API `setWebhook` (POST) ke `https://<worker-domain>/telegram/webhook` dengan `secret_token` yang sama dan `allowed_updates` mencakup `message` dan `channel_post`.
5. Atur bot's Mini App URL ke domain HTTPS Worker.

### Mengunggah
Posting teks ke channel: `#comic|slug-judul|Judul Orisinal|webtoon|Sinopsis singkat`.
Unggah **foto satu per satu**, setiap caption `#page|slug-judul|1|1|Chapter Pertama` lalu halaman kedua `#page|slug-judul|1|2|Chapter Pertama` dan seterusnya.
Webhook memverifikasi Telegram secret dan channel ID. Hanya judul berlabel `original` yang diterima untuk penyimpanan halaman.
Server membuat URL media bertanda tangan dengan masa aktif 10 menit; token bot tidak diberikan ke klien.

### Batasan
- Bot API biasa mengunduh media hingga 20 MB/file; unggah gambar di bawah batas ini.
- CloudStorage maksimal 1024 key per bot per pengguna; setiap key value maksimal 4096 karakter.
- Telegram tidak menggantikan backup independen. Penghapusan channel/bot/file dapat memutus akses.
- Data bookmark/history lama di tabel D1 tetap ada, tetapi client Telegram baru memakai CloudStorage. Migrasi data lama belum dilakukan.
- Bot token dan Channel ID tidak tersedia pada koneksi ini; webhook serta distribusi media belum aktif sebelum konfigurasi secrets.
