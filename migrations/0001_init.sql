PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL DEFAULT '',
  username TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS comics (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL CHECK(type IN ('manga','manhwa','manhua','webtoon','donghua','original')),
  status TEXT NOT NULL CHECK(status IN ('ongoing','completed','hiatus')),
  synopsis TEXT NOT NULL,
  genres TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  art_code INTEGER NOT NULL DEFAULT 0,
  source_type TEXT NOT NULL DEFAULT 'original',
  official_url TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_comics_type ON comics(type);
CREATE INDEX IF NOT EXISTS idx_comics_score ON comics(score DESC);
CREATE TABLE IF NOT EXISTS chapters (
  id TEXT PRIMARY KEY,
  comic_id TEXT NOT NULL REFERENCES comics(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  title TEXT NOT NULL,
  released_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(comic_id, number)
);
CREATE INDEX IF NOT EXISTS idx_chapters_comic ON chapters(comic_id, number DESC);
CREATE TABLE IF NOT EXISTS bookmarks (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  comic_id TEXT NOT NULL REFERENCES comics(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id, comic_id)
);
CREATE TABLE IF NOT EXISTS reading_history (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  comic_id TEXT NOT NULL REFERENCES comics(id) ON DELETE CASCADE,
  chapter_number INTEGER NOT NULL DEFAULT 1,
  percent INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id, comic_id)
);
CREATE INDEX IF NOT EXISTS idx_history_user ON reading_history(user_id,updated_at DESC);