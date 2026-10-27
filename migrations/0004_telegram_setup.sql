-- One-time Telegram webhook bootstrap state (safe to rerun).
CREATE TABLE IF NOT EXISTS telegram_setup_status (
 id INTEGER PRIMARY KEY CHECK(id = 1),
 status TEXT NOT NULL,
 webhook_url TEXT,
 bot_username TEXT,
 channel_status TEXT,
 error_code TEXT,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
