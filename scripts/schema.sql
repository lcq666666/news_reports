-- SQLite schema for news_reports. One row per article/item per day.
-- This file is the schema only; data/news.db is the generated file for a day.
-- No secrets are stored in this schema or in the database.
CREATE TABLE IF NOT EXISTS articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  url TEXT NOT NULL,
  source TEXT,
  image_url TEXT,
  audio_path TEXT
);
CREATE INDEX IF NOT EXISTS idx_articles_date_category ON articles (date, category);
CREATE INDEX IF NOT EXISTS idx_articles_url ON articles (url);
