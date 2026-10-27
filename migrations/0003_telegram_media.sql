-- Non-destructive migration for the existing Scanstoon MVP schema.
-- Stores Telegram media references only; the image files stay in Telegram.
CREATE TABLE IF NOT EXISTS telegram_media (
  id TEXT PRIMARY KEY,
  chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL CHECK(page_number > 0),
  file_id TEXT NOT NULL,
  file_unique_id TEXT NOT NULL,
  file_size INTEGER NOT NULL DEFAULT 0,
  mime_type TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  message_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(chapter_id,page_number),
  UNIQUE(chat_id,message_id)
);
CREATE INDEX IF NOT EXISTS idx_telegram_media_chapter ON telegram_media(chapter_id,page_number);
