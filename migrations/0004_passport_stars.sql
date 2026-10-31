-- Scanstoon .toon Passport: one-time Telegram Stars purchase, verified via webhook.
-- Do not store Telegram initData or bot tokens in these tables.
CREATE TABLE IF NOT EXISTS passport_orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stars_amount INTEGER NOT NULL CHECK(stars_amount > 0 AND stars_amount <= 10000),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid')),
  telegram_payment_charge_id TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  paid_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_passport_orders_user ON passport_orders(user_id, status);
CREATE TABLE IF NOT EXISTS passport_entitlements (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK(source IN ('telegram_stars')),
  granted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_passport_entitlements_user ON passport_entitlements(user_id);
