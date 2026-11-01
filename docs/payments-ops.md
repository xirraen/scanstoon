# Scanstoon Paspor .toon — Payment Operations

## Kebijakan dan cakupan

- Paspor .toon adalah identitas digital dan badge Scanstoon, **bukan** Telegram Premium, token, NFT, atau akses otomatis ke komik komersial.
- Pembayaran untuk fitur digital Telegram Mini App harus dalam **Telegram Stars (XTR)**. Harga default `250 Stars` di UI adalah indikatif sampai disetujui operator; **US$5 dalam TON tidak digunakan untuk checkout Premium**.
- **Pembayaran nonaktif secara default**. Jangan aktifkan penjualan sebelum fitur support dan penanganan refund dipastikan berjalan.
- Jangan pernah menulis token bot, webhook secret, token signing, maupun bukti pembayaran pelanggan ke issue publik atau repository.

## Prasyarat rilis

1. Deploy migrasi D1 `migrations/0004_passport_stars.sql` dan `migrations/0005_passport_operations.sql` (urut) di database `scanstoon-db` akun Cloudflare **C5**. Migrasi 0005 memakai `ALTER TABLE`, jadi jalankan **sekali**, jangan mengulangi setelah berhasil.
2. Deploy Worker yang memuat handler `pre_checkout_query`, `successful_payment`, `refunded_payment`, dan `/paysupport`; cek `GET /api/health` menunjukkan v0.7.0.
3. Jalankan fungsi `scheduled` Worker menggunakan Cron Trigger sementara dan cek `getWebhookInfo` bahwa `allowed_updates` mencakup `message`, `channel_post`, `pre_checkout_query`. **Hapus Cron Trigger sementara** setelah verifikasi bila sebelumnya tidak ada jadwal.
4. Pastikan `PASSPORT_SUPPORT_CHAT_ID` berisi chat ID Telegram admin untuk notifikasi support. Untuk menemukan ID, gunakan metode tepercaya melalui bot/chat ID Telegram yang dikelola sendiri; jangan kirim token bot ke chat publik.
5. Uji `/paysupport` di chat privat dengan `@ScanstoonBot`. User harus mendapat nomor tiket; pesan `/ticket PS-... deskripsi` diterima dan notifikasi sampai di chat dukungan (jika konfigurasi admin benar). Tiket tersimpan di tabel `passport_support_tickets`.
6. Tentukan harga dalam XTR bersama pemilik dan periksa syarat serta kapasitas admin/refund. Baru kemudian set `PASSPORT_STARS_PRICE` ke integer positif (1–10.000), `PASSPORT_SUPPORT_CHAT_ID` chat admin, `PASSPORT_SALES_ENABLED=true` pada Cloudflare Worker. Verifikasi kembali konfigurasi setelah deploy; **jangan** langsung aktifkan hanya untuk pengujian.
7. Jalankan pembayaran real kecil menggunakan akun yang benar-benar menyetujui transaksi; periksa invoice, precheckout, `successful_payment`, status Premium, receipt, serta alur refund.

## Langkah investigasi dan refund

- Mulai dari tiket privat pelanggan, verifikasi ID Telegram pembeli dan receipt/charge ID. Hindari berbagi ID atau screenshot transaksi di issue publik.
- Di database `passport_orders`, cari order terkait `user_id`, `status`, `telegram_payment_charge_id`, dan `stars_amount`. Jangan mengubah tabel secara manual untuk menandai transaksi sukses.
- Untuk mengembalikan Stars yang benar-benar sudah terbayar, operator dapat menjalankan metode resmi Telegram Bot API **`refundStarPayment`** dengan `user_id` Telegram dan `telegram_payment_charge_id` yang diverifikasi. Jangan memanggil metode tersebut tanpa memvalidasi permintaan pengguna dan keputusan operator.
- Telegram mengirim `message.refunded_payment`. Worker memasukkan catatan idempoten ke `passport_refunds` dan mencabut entitlement Premium bila tidak ada pembelian lain yang belum direfund. Kode menangani refund tiba **sebelum** notifikasi `successful_payment` untuk order yang cocok.
- `stars_spent` menampilkan jumlah Stars *neto* yang telah dibayarkan dan belum direfund, **bukan saldo Stars milik user**.

## Checkpoint pemantauan

Gunakan D1 SQL read-only:

```sql
SELECT status, COUNT(*) AS orders FROM passport_orders GROUP BY status;
SELECT COUNT(*) AS members FROM passport_entitlements;
SELECT COUNT(*) AS refund_count FROM passport_refunds;
SELECT status, COUNT(*) AS tickets FROM passport_support_tickets GROUP BY status;
```

Jika jumlah pembayaran masuk berbeda dari jumlah entitlement, atau pengguna mengaku telah membayar tetapi tidak mendapat akses, **jangan menyalakan penjualan tambahan** sampai transaksi diverifikasi. Harga dari screenshot bukan bukti pembayaran.

Referensi: https://core.telegram.org/bots/payments-stars, https://core.telegram.org/bots/api dan https://core.telegram.org/bots/webapps.
