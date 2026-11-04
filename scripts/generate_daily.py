#!/usr/bin/env python3
"""
Skeleton pipeline for news_reports.

Locked spec (skeleton stage):
- Fetch RSS (feedparser) and optionally GNews (HTTP JSON, only if
  GNEWS_API_KEY is present in the environment -- never hard-coded here).
- Deduplicate by normalised title + URL.
- Classify into politics / military / current / research / large-models / ai
  / tools by keyword rules (AI classification is a later step).
- AI summary: PLACEHOLDER only in this skeleton. It returns a truncated
  excerpt and marks it as a placeholder. The formal run replaces this with
  a model call whose key comes from the environment / a secret store,
  never from chat and never committed to the repo.
- Write one JSON file per date under data/ and the same items into
  SQLite (see schema.sql). No secrets, no credentials in any output.

Usage:
    python3 scripts/generate_daily.py --date 2026-11-04
    python3 scripts/generate_daily.py --date 2026-11-04 --sample
    python3 scripts/generate_daily.py --date 2026-11-04 --out-dir data --db data/news.db

With no feeds configured and no --sample, this still writes a valid
(empty-sections) JSON + SQLite row set, so the skeleton is testable
without network access or keys.
"""

import argparse
import asyncio
import hashlib
import json
import os
import re
import sqlite3
import sys
from datetime import date as date_cls
from pathlib import Path

# ---------------------------------------------------------------- feeds
# Live feeds confirmed from earlier research (2026-11-04). Google News RSS
# needs no key; LINUX DO and V2EX publish native RSS; AIHOT publishes a
# daily Chinese AI feed. GNews is optional and key-gated (see fetch_gnews).
# HelloGitHub is monthly (28th), so it is NOT a daily feed here: the
# formal daily run rotates one item from its latest issue and labels it
# as a monthly pick, rather than pretending it is new that day.
RSS_SOURCES = [
    {"name": "Google News 政治", "category": "politics", "url": "https://news.google.com/rss/search?q=政治&hl=zh-CN&gl=CN&ceid=CN:zh"},
    {"name": "Google News 军事", "category": "military", "url": "https://news.google.com/rss/search?q=军事&hl=zh-CN&gl=CN&ceid=CN:zh"},
    {"name": "Google News 时事", "category": "current", "url": "https://news.google.com/rss/search?q=时事新闻&hl=zh-CN&gl=CN&ceid=CN:zh"},
    {"name": "Google News 科研", "category": "research", "url": "https://news.google.com/rss/search?q=科研&hl=zh-CN&gl=CN&ceid=CN:zh"},
    {"name": "Google News 大模型", "category": "large-models", "url": "https://news.google.com/rss/search?q=大模型&hl=zh-CN&gl=CN&ceid=CN:zh"},
    {"name": "Google News 人工智能", "category": "ai", "url": "https://news.google.com/rss/search?q=人工智能&hl=zh-CN&gl=CN&ceid=CN:zh"},
    {"name": "AIHOT 每日", "category": "ai", "url": "https://aihot.news/feed/daily.xml"},
    {"name": "LINUX DO 热门", "category": "", "url": "https://linux.do/top.rss"},
    {"name": "LINUX DO 最新", "category": "", "url": "https://linux.do/latest.rss"},
    {"name": "V2EX 技术", "category": "", "url": "https://www.v2ex.com/feed/tab/tech.xml"},
    {"name": "V2EX 创意", "category": "", "url": "https://www.v2ex.com/feed/tab/creative.xml"},
    {"name": "V2EX 好玩", "category": "", "url": "https://www.v2ex.com/feed/tab/play.xml"},
]

GNEWS_CATEGORIES = {
    "technology": "ai",
    "science": "research",
    "world": "current",
}

KEYWORDS = {
    "politics": ["政治", "政府", "政策", "人大", "政协", "外交", "politics", "policy"],
    "military": ["军事", "军队", "国防", "演习", "武器", "military", "defense"],
    "research": ["科研", "论文", "研究", "科学家", "期刊", "research", "paper", "science"],
    "large-models": ["大模型", "LLM", "语言模型", "GPT", "DeepSeek", "large language model"],
    "ai": ["人工智能", "AI", "机器学习", "深度学习", "artificial intelligence", "machine learning"],
    "tools": ["开源", "工具", "教程", "博客", "GitHub", "open source", "tool"],
}


def normalise(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip().lower())


def classify(title: str, summary: str, hint: str = "") -> str:
    """Keyword classification. Hint (feed category) wins only if it maps."""
    if hint in KEYWORDS:
        return hint
    text = normalise(f"{title} {summary}")
    for category, words in KEYWORDS.items():
        if any(w.lower() in text for w in words):
            return category
    return "current"


def summarise_placeholder(title: str, text: str) -> str:
    """Fallback excerpt summary, clearly labelled as a placeholder."""
    excerpt = normalise(text)[:160]
    return f"[摘要占位，正式版由 AI 摘要替换] {excerpt}" if excerpt else "[摘要占位]"


def summarise(title: str, text: str) -> str:
    """AI summary when a key is available, otherwise the placeholder.

    DeepSeek is used only when DEEPSEEK_API_KEY is present in the
    environment. The key is never hard-coded and never committed.
    Without a key this returns the labelled placeholder, so a run
    never pretends an excerpt is a finished AI summary.
    """
    key = os.environ.get("DEEPSEEK_API_KEY", "")
    if not key or not text:
        return summarise_placeholder(title, text)
    try:
        import requests
        resp = requests.post(
            "https://api.deepseek.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json={
                "model": "deepseek-chat",
                "messages": [
                    {"role": "system", "content": "你是一名中文新闻编辑。用不超过80个汉字概括新闻要点，只输出摘要本身，不要加标题或前缀。"},
                    {"role": "user", "content": f"标题：{title}\n正文/导读：{text[:2000]}"},
                ],
                "temperature": 0.3,
            },
            timeout=30,
        )
        resp.raise_for_status()
        out = resp.json()["choices"][0]["message"]["content"].strip()
        return out if out else summarise_placeholder(title, text)
    except Exception as exc:  # noqa: BLE001 - summary failure must not kill the run
        print(f"WARNING: DeepSeek summary failed, using placeholder: {exc}", file=sys.stderr)
        return summarise_placeholder(title, text)


async def _edge_tts_save(text: str, out_path: Path, voice: str = "zh-CN-XiaoxiaoNeural"):
    import edge_tts  # optional dependency; caller handles ImportError
    communicate = edge_tts.Communicate(text, voice)
    await communicate.save(str(out_path))


def generate_audio(payload, audio_root: Path):
    """Generate one Edge-TTS MP3 per item (female voice, normal rate).

    The web player applies the user's chosen default 1.2x playback rate,
    so files are generated at normal rate -- do NOT also add +20% here,
    or the effective speed would become ~1.44x. Failures are warned
    and skipped per item; the player then falls back to browser speech.
    """
    try:
        import edge_tts  # noqa: F401
    except ImportError:
        print("WARNING: edge-tts not installed; audio step skipped. "
              "Install: pip install -r scripts/requirements.txt", file=sys.stderr)
        return 0
    count = 0
    for section in payload["sections"]:
        for it in section["items"]:
            summary = re.sub(r"^\[.*?\]\s*", "", it["summary"] or "")
            text = f"{it['title']}。{summary}".strip()
            if not text:
                continue
            out_path = audio_root / payload["date"] / f"{it['id']}.mp3"
            out_path.parent.mkdir(parents=True, exist_ok=True)
            try:
                asyncio.run(_edge_tts_save(text, out_path))
                if out_path.stat().st_size == 0:
                    raise RuntimeError("Edge-TTS produced an empty file")
                count += 1
            except Exception as exc:  # noqa: BLE001
                print(f"WARNING: Edge-TTS failed for {it['id']}: {exc}", file=sys.stderr)
                try:
                    out_path.unlink(missing_ok=True)
                except OSError:
                    pass
    return count


def dedupe(items):
    seen = set()
    out = []
    for item in items:
        key = hashlib.sha256(normalise(f"{item['title']}|{item['url']}").encode()).hexdigest()
        if key in seen:
            continue
        seen.add(key)
        out.append(item)
    return out


def fetch_rss_sources():
    """Fetch configured RSS feeds with feedparser (optional dependency)."""
    try:
        import feedparser
    except ImportError:
        print("WARNING: feedparser not installed; RSS step skipped. "
              "Run: python3 -m pip install -r scripts/requirements.txt", file=sys.stderr)
        return []
    items = []
    for src in RSS_SOURCES:
        try:
            feed = feedparser.parse(src["url"])
            for entry in feed.entries:
                title = getattr(entry, "title", "")
                summary = re.sub(r"<[^>]+>", "", getattr(entry, "summary", "") or getattr(entry, "description", ""))
                items.append({
                    "category": classify(title, summary, src.get("category", "")),
                    "title": title,
                    "summary": summarise(title, summary),
                    "url": getattr(entry, "link", ""),
                    "source": src["name"],
                    "image_url": None,
                    "audio_path": None,
                })
        except Exception as exc:  # noqa: BLE001 - skeleton must not crash on one bad feed
            print(f"WARNING: RSS feed failed ({src['name']}): {exc}", file=sys.stderr)
    return items


def fetch_gnews():
    """Optional GNews top-headlines. Skipped entirely without a key.

    The key is read only from the GNEWS_API_KEY environment variable.
    Product Hunt token setup (user question 6/7 in the locked spec) is
    a separate, later decision and is NOT handled here.
    """
    key = os.environ.get("GNEWS_API_KEY", "")
    if not key:
        return []
    try:
        import requests
    except ImportError:
        print("WARNING: requests not installed; GNews step skipped.", file=sys.stderr)
        return []
    items = []
    for gcat, category in GNEWS_CATEGORIES.items():
        try:
            resp = requests.get(
                "https://gnews.io/api/v4/top-headlines",
                params={"category": gcat, "lang": "zh", "country": "cn", "max": 10, "apikey": key},
                timeout=15,
            )
            resp.raise_for_status()
            for art in resp.json().get("articles", []):
                items.append({
                    "category": category,
                    "title": art.get("title", ""),
                    "summary": summarise(art.get("title", ""), art.get("description", "")),
                    "url": art.get("url", ""),
                    "source": (art.get("source") or {}).get("name", "GNews"),
                    "image_url": art.get("image"),
                    "audio_path": None,
                })
        except Exception as exc:  # noqa: BLE001
            print(f"WARNING: GNews failed ({gcat}): {exc}", file=sys.stderr)
    return items


def cap_items(items, per_category: int = 10, tools_max: int = 8):
    """Cap per-category counts for a readable daily briefing.

    A raw live run fetched 229 items on 2026-11-04 (mostly overlapping
    Google News searches); without a cap the page and the audio would
    be unusable. Counts stay flexible in the sense that a thin category
    simply contributes fewer items -- the cap is a ceiling, not a quota.
    Formal ranking (AI scoring) should replace first-come order later.
    """
    counts = {}
    out = []
    for it in items:
        cat = it["category"]
        limit = tools_max if cat == "tools" else per_category
        if counts.get(cat, 0) >= limit:
            continue
        counts[cat] = counts.get(cat, 0) + 1
        out.append(it)
    return out


def sample_items(day: str):
    """Clearly-labelled sample items, mirroring data/<day>.json structure."""
    with open(Path(__file__).resolve().parent.parent / "data" / "2026-11-04.json", encoding="utf-8") as f:
        sample = json.load(f)
    items = []
    for section in sample["sections"]:
        for it in section["items"]:
            items.append({
                "category": it["category"],
                "title": it["title"],
                "summary": it["summary"],
                "url": it["url"],
                "source": it["source"],
                "image_url": it.get("image_url"),
                "audio_path": it["audio_path"],
            })
    return items


def write_outputs(day: str, items, out_dir: Path, db_path: Path, generate_audio_flag: bool = False):
    sections_order = ["politics", "military", "current", "research", "large-models", "ai", "tools"]
    names = {"politics": "政治", "military": "军事", "current": "时事", "research": "科研",
             "large-models": "大模型", "ai": "人工智能", "tools": "今日值得一试"}
    grouped = {c: [] for c in sections_order}
    for i, item in enumerate(items, start=1):
        cat = item["category"] if item["category"] in grouped else "current"
        grouped[cat].append({
            "id": f"{cat}-{i:02d}",
            "category": cat,
            "title": item["title"],
            "summary": item["summary"],
            "url": item["url"],
            "source": item["source"],
            "image_url": item.get("image_url"),
            "audio_path": item.get("audio_path") or f"/audio/{day}/{cat}-{i:02d}.mp3",
        })
    payload = {
        "date": day,
        "generated_at": f"{day}T07:00:00+08:00",
        "is_sample": False,
        "sections": [{"id": c, "name": names[c], "items": grouped[c]} for c in sections_order],
    }
    out_dir.mkdir(parents=True, exist_ok=True)
    json_path = out_dir / f"{day}.json"
    json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    db_path.parent.mkdir(parents=True, exist_ok=True)
    schema = (Path(__file__).resolve().parent / "schema.sql").read_text(encoding="utf-8")
    conn = sqlite3.connect(db_path)
    try:
        conn.executescript(schema)
        conn.execute("DELETE FROM articles WHERE date = ?", (day,))
        for section in payload["sections"]:
            for it in section["items"]:
                conn.execute(
                    "INSERT INTO articles (date, category, title, summary, url, source, image_url, audio_path) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    (day, it["category"], it["title"], it["summary"], it["url"],
                     it["source"], it["image_url"], it["audio_path"]),
                )
        conn.commit()
    finally:
        conn.close()
    if generate_audio_flag:
        audio_root = Path(__file__).resolve().parent.parent / "public" / "audio"
        made = generate_audio(payload, audio_root)
        print(f"Generated {made} Edge-TTS audio files under {audio_root / day}")
    return json_path


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate one day of news_reports data (skeleton).")
    parser.add_argument("--date", default=date_cls.today().isoformat(), help="YYYY-MM-DD")
    parser.add_argument("--out-dir", default="data", help="JSON output directory")
    parser.add_argument("--db", default="data/news.db", help="SQLite file path")
    parser.add_argument("--sample", action="store_true", help="Use labelled sample items instead of live feeds")
    parser.add_argument("--audio", action="store_true", help="Generate one Edge-TTS MP3 per item under public/audio/<date>/")
    args = parser.parse_args()

    if args.sample:
        items = sample_items(args.date)
    else:
        items = cap_items(dedupe(fetch_rss_sources() + fetch_gnews()))
    json_path = write_outputs(args.date, items, Path(args.out_dir), Path(args.db), generate_audio_flag=args.audio)
    print(f"Wrote {len(items)} items -> {json_path} and {args.db}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
