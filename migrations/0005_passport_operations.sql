-- Scanstoon Passport v0.7: keep historical receipts, protect active entitlements after refunds.
-- Production v0.6 has no orders at migration time; a unique pending-order index
-- prevents multiple simultaneous invoices for the same account.
ALTER TABLE passport_orders ADD COLUMN checkout_at TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_passport_one_pending ON passport_orders(user_id) WHERE status='pending';
CREATE TABLE IF NOT EXISTS passport_refunds (
  telegram_payment_charge_id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES passport_orders(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  stars_amount INTEGER NOT NULL CHECK(stars_amount>0),
  refunded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_passport_refunds_user ON passport_refunds(user_id);
CREATE TABLE IF NOT EXISTS passport_support_tickets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  issue TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_passport_support_user ON passport_support_tickets(user_id,created_at DESC);
