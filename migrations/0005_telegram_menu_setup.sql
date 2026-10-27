-- Telegram default Mini App menu setup status, without storing credentials.
CREATE TABLE IF NOT EXISTS telegram_menu_setup (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  status TEXT NOT NULL,
  menu_url TEXT,
  error_code TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
