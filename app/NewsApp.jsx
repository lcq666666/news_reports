"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/* Card + sub-page redesign, 2026-11-04 (user feedback):
   No more one long flat list. Three levels, all inside this site:
   - Home: one card per theme/category (name, count, top headlines).
     Click a card -> that category's sub-page.
   - Category sub-page: one card per news item. Click a card ->
     that item's detail sub-page. Cards can also be switched with
     prev/next, and each card still has play + original link.
   - Detail sub-page: the stored copy for this item lives HERE:
     title, one-line summary, and the source excerpt (item.excerpt,
     stored at generation time from the feed, never full text).
     The original link is still offered, but it is no longer the
     only way to read more. No full-text scraping, no invented facts:
     when an excerpt is missing the detail shows the summary only
     and says so.
   Category colour stays an accent: dot + label, never a block. */

export const CATEGORY_COLORS = {
  politics: "#B91C1C",
  military: "#14532D",
  current: "#EA580C",
  research: "#2563EB",
  "large-models": "#7C3AED",
  ai: "#0F766E",
  tools: "#92400E",
};

const THEMES = [
  { id: "magazine", label: "杂志大图" },
  { id: "newspaper", label: "头版日报" },
  { id: "dark", label: "深色极客" },
  { id: "light-card", label: "轻量卡片" },
  { id: "podcast", label: "播客晨报" },
];

const cardStyle = {
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  background: "var(--surface)",
  padding: 20,
};

export default function NewsApp({ data }) {
  const sections = data?.sections || [];
  const flat = useMemo(
    () => sections.flatMap((s) => (s.items || []).map((it) => ({ ...it, sectionName: s.name }))),
    [sections]
  );

  const [theme, setTheme] = useState("magazine");
  const [view, setView] = useState({ type: "home" });
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [useSpeech, setUseSpeech] = useState(false);
  const [notice, setNotice] = useState("");
  const [rate, setRate] = useState(1.2);
  const [voices, setVoices] = useState([]);
  const [voiceName, setVoiceName] = useState("auto");

  const audioRef = useRef(null);
  const playingRef = useRef(false);
  const indexRef = useRef(0);
  const speechTimerRef = useRef(null);
  const speechChunkRef = useRef(0);
  const audioUnavailableRef = useRef(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("news-theme");
      if (saved && THEMES.some((t) => t.id === saved)) setTheme(saved);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem("news-theme", theme);
    } catch {}
  }, [theme]);
  useEffect(() => {
    playingRef.current = playing;
    indexRef.current = index;
  }, [playing, index]);
  useEffect(() => {
    try {
      window.scrollTo(0, 0);
    } catch {}
  }, [view]);

  useEffect(() => {
    const load = () => {
      try {
        const zh = (window.speechSynthesis?.getVoices() || []).filter((v) =>
          (v.lang || "").toLowerCase().startsWith("zh")
        );
        if (zh.length) setVoices(zh);
      } catch {}
    };
    load();
    try {
      window.speechSynthesis?.addEventListener("voiceschanged", load);
    } catch {}
    return () => {
      try {
        window.speechSynthesis?.removeEventListener("voiceschanged", load);
        window.speechSynthesis?.cancel();
        if (speechTimerRef.current) clearTimeout(speechTimerRef.current);
      } catch {}
    };
  }, []);

  const current = flat[index] || null;
  const detailItem =
    view.type === "detail" ? flat.find((f) => f.id === view.itemId) || null : null;
  const detailSection = detailItem
    ? sections.find((s) => s.id === detailItem.category)
    : null;
  const detailSiblings = detailSection ? detailSection.items || [] : [];
  const detailPos = detailItem
    ? detailSiblings.findIndex((it) => it.id === detailItem.id)
    : -1;

  function pickVoice() {
    try {
      const all = window.speechSynthesis.getVoices() || [];
      if (voiceName !== "auto") {
        const chosen = all.find((v) => v.name === voiceName);
        if (chosen) return chosen;
      }
      const zh = all.filter((v) => (v.lang || "").toLowerCase().startsWith("zh"));
      if (!zh.length) return null;
      const score = (v) => {
        const n = (v.name || "").toLowerCase();
        if (n.includes("xiaoxiao")) return 100;
        if (n.includes("yunyang") || n.includes("yunxia")) return 90;
        if (n.includes("natural") || n.includes("neural")) return 80;
        if (n.includes("google")) return 70;
        if (n.includes("microsoft")) return 60;
        if (n.includes("ting") || n.includes("yao") || n.includes("mei")) return 50;
        return 10;
      };
      return [...zh].sort((a, b) => score(b) - score(a))[0];
    } catch {
      return null;
    }
  }

  function splitSentences(text) {
    const parts = (text || "")
      .split(/(?<=[。！？；])/g)
      .map((s) => s.trim())
      .filter(Boolean);
    const chunks = [];
    for (const p of parts) {
      if (p.length <= 60) chunks.push(p);
      else
        for (const c of p.split(/(?<=，)/g).map((s) => s.trim()).filter(Boolean))
          chunks.push(c);
    }
    return chunks.length ? chunks : [text];
  }

  function speak(item, idx, startChunk = 0) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setNotice("此浏览器不支持朗读，请用预生成的 MP3。");
      setPlaying(false);
      return;
    }
    try {
      window.speechSynthesis.cancel();
      if (speechTimerRef.current) clearTimeout(speechTimerRef.current);
      const chunks = splitSentences(`${item.title}。${item.summary || ""}`);
      const voice = pickVoice();
      let ci = startChunk;
      const speakChunk = () => {
        if (!playingRef.current || idx !== indexRef.current) return;
        speechChunkRef.current = ci;
        if (ci >= chunks.length) {
          if (playingRef.current && idx === indexRef.current)
            speechTimerRef.current = setTimeout(() => playAt((idx + 1) % flat.length, false), 350);
          return;
        }
        const u = new SpeechSynthesisUtterance(chunks[ci]);
        u.lang = "zh-CN";
        u.rate = rate;
        u.pitch = 1.0;
        if (voice) u.voice = voice;
        u.onend = () => {
          ci += 1;
          speechTimerRef.current = setTimeout(speakChunk, 180);
        };
        u.onerror = () => {
          ci += 1;
          speechTimerRef.current = setTimeout(speakChunk, 180);
        };
        window.speechSynthesis.speak(u);
      };
      speakChunk();
    } catch {
      setNotice("浏览器朗读失败，请用预生成的 MP3。");
      setPlaying(false);
    }
  }

  function playAt(i, fromUser = true) {
    if (!flat.length) return;
    const item = flat[i];
    setIndex(i);
    setUseSpeech(false);
    setNotice("");
    setPlaying(true);
    playingRef.current = true;
    indexRef.current = i;
    try {
      window.speechSynthesis?.cancel();
      if (speechTimerRef.current) clearTimeout(speechTimerRef.current);
    } catch {}
    const el = audioRef.current;
    if (!el || audioUnavailableRef.current) {
      setUseSpeech(true);
      if (audioUnavailableRef.current && !notice)
        setNotice("本期暂无预生成音频，已直接走浏览器朗读，不再逐条报错。");
      speak(item, i);
      return;
    }
    const base =
      typeof window !== "undefined" && window.location.pathname.startsWith("/news_reports")
        ? "/news_reports"
        : "";
    el.src = item.audio_path ? base + item.audio_path : "";
    el.playbackRate = rate;
    el.play().catch(() => {
      audioUnavailableRef.current = true;
      setUseSpeech(true);
      setNotice("本期暂无预生成音频，已直接走浏览器朗读，不再逐条报错。");
      speak(item, i);
    });
  }

  function togglePlay() {
    if (!current) return;
    if (playing) {
      try {
        audioRef.current?.pause();
        window.speechSynthesis?.cancel();
        if (speechTimerRef.current) clearTimeout(speechTimerRef.current);
      } catch {}
      setPlaying(false);
      playingRef.current = false;
      return;
    }
    if (useSpeech) {
      setPlaying(true);
      playingRef.current = true;
      speak(current, index, speechChunkRef.current);
    } else {
      playAt(index);
    }
  }

  function skip(seconds) {
    const el = audioRef.current;
    if (useSpeech || !el || !el.duration) {
      setNotice("浏览器朗读模式下 ±15 秒在真实 MP3 播放时生效，请用上一条 / 下一条切换。");
      return;
    }
    el.currentTime = Math.max(0, Math.min(el.duration, el.currentTime + seconds));
  }

  function changeRate(next) {
    setRate(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
    if (useSpeech && playing && current) speak(current, index, speechChunkRef.current);
  }

  function onAudioEnded() {
    if (flat.length) playAt((index + 1) % flat.length, false);
  }
  function onAudioError() {
    if (current && !useSpeech) {
      audioUnavailableRef.current = true;
      setUseSpeech(true);
      setNotice("本期暂无预生成音频，已直接走浏览器朗读，不再逐条报错。");
      speak(current, index);
    }
  }

  function changeVoice(next) {
    setVoiceName(next);
    if (useSpeech && playing && current) speak(current, index, speechChunkRef.current);
  }

  function goDetail(item) {
    setView({ type: "detail", itemId: item.id });
  }
  function flatIndexOf(item) {
    return flat.findIndex((f) => f.id === item.id);
  }

  function renderHome() {
    return (
      <main className="mt-8">
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          点一张板块卡片进去看这个主题的全部新闻，再点一张新闻卡片看详情。详情页站内存了一份导读，不用每次都跳原文。
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          {sections.map((s) => {
            const color = CATEGORY_COLORS[s.id] || "#374151";
            const items = s.items || [];
            return (
              <article
                key={s.id}
                onClick={() => setView({ type: "category", id: s.id })}
                className="cursor-pointer"
                style={cardStyle}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setView({ type: "category", id: s.id });
                }}
              >
                <div className="flex items-center gap-2 text-xs tracking-wide" style={{ color }}>
                  <span className="inline-block w-2 h-2 rounded-full" style={{ background: color }} />
                  {s.name}
                  <span style={{ color: "var(--muted)" }}>{items.length} 条</span>
                </div>
                {items[0] && (
                  <h3 className="headline headline-3 mt-3">{items[0].title}</h3>
                )}
                {items[1] && (
                  <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
                    {items[1].title}
                  </p>
                )}
                <div className="mt-4 text-sm font-bold" style={{ color: "var(--accent)" }}>
                  进入板块 →
                </div>
              </article>
            );
          })}
        </div>
      </main>
    );
  }

  function renderCategory() {
    const section = sections.find((s) => s.id === view.id);
    if (!section) return null;
    const color = CATEGORY_COLORS[section.id] || "#374151";
    return (
      <main className="mt-8">
        <button onClick={() => setView({ type: "home" })} className="text-sm underline underline-offset-4" style={{ color: "var(--accent)" }}>
          ← 全部板块
        </button>
        <h2 className="headline headline-2 mt-4 flex items-baseline gap-2">
          <span className="inline-block w-2 h-4 rounded-sm" style={{ background: color }} />
          {section.name}
          <span className="text-sm font-normal" style={{ color: "var(--muted)" }}>
            {(section.items || []).length} 条
          </span>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          {(section.items || []).map((item) => {
            const isCurrent = current && current.id === item.id;
            return (
              <article key={item.id} style={cardStyle}>
                <div
                  className="cursor-pointer"
                  onClick={() => goDetail(item)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") goDetail(item);
                  }}
                >
                  <div className="flex items-center gap-2 text-xs tracking-wide" style={{ color }}>
                    <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                    {section.name}
                    {isCurrent && playing ? <span style={{ color: "var(--muted)" }}>· 正在播报</span> : null}
                  </div>
                  <h3 className="headline headline-3 mt-2">{item.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed" style={{ color: "var(--muted)" }}>
                    {item.summary}
                  </p>
                  <div className="mt-3 text-sm font-bold" style={{ color: "var(--accent)" }}>
                    查看详情 →
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-4 text-sm" style={{ color: "var(--muted)" }}>
                  <button onClick={() => playAt(flatIndexOf(item))} className="underline underline-offset-4" style={{ color: "var(--accent)" }}>
                    {isCurrent && playing ? "暂停播报" : "播报本条"}
                  </button>
                  <a href={item.url} target="_blank" rel="noreferrer" className="underline underline-offset-4">
                    原文 ↗
                  </a>
                  <span>来源：{item.source}</span>
                </div>
              </article>
            );
          })}
        </div>
      </main>
    );
  }

  function renderDetail() {
    if (!detailItem) {
      return (
        <main className="mt-8">
          <p style={{ color: "var(--muted)" }}>这条详情找不到了，请回首页。</p>
          <button onClick={() => setView({ type: "home" })} className="mt-4 underline underline-offset-4" style={{ color: "var(--accent)" }}>
            ← 回全部板块
          </button>
        </main>
      );
    }
    const color = CATEGORY_COLORS[detailItem.category] || "#374151";
    const excerpt = (detailItem.excerpt || "").trim();
    const prev = detailPos > 0 ? detailSiblings[detailPos - 1] : null;
    const next = detailPos >= 0 && detailPos < detailSiblings.length - 1 ? detailSiblings[detailPos + 1] : null;
    const isCurrent = current && current.id === detailItem.id;
    return (
      <main className="mt-8">
        <div className="flex flex-wrap gap-4 text-sm">
          <button onClick={() => setView({ type: "home" })} className="underline underline-offset-4" style={{ color: "var(--accent)" }}>
            ← 全部板块
          </button>
          <button onClick={() => setView({ type: "category", id: detailItem.category })} className="underline underline-offset-4" style={{ color: "var(--accent)" }}>
            ← {detailSection ? detailSection.name : "返回板块"}
          </button>
        </div>
        <article className="mt-6" style={cardStyle}>
          <div className="flex items-center gap-2 text-xs tracking-wide" style={{ color }}>
            <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: color }} />
            {detailItem.sectionName || detailItem.category}
            <span style={{ color: "var(--muted)" }}>· 来源：{detailItem.source} · {data.date}</span>
          </div>
          <h2 className="headline headline-2 mt-3">{detailItem.title}</h2>
          <p className="mt-4 text-base leading-relaxed font-bold">{detailItem.summary}</p>
          <div className="mt-6 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
            <div className="text-xs tracking-wide" style={{ color: "var(--muted)" }}>
              站内存档导读（来源导读存档，非全文）
            </div>
            {excerpt && excerpt.length > 80 && excerpt !== detailItem.summary ? (
              <p className="mt-3 leading-relaxed" style={{ color: "var(--muted)" }}>{excerpt}</p>
            ) : (
              <p className="mt-3 leading-relaxed" style={{ color: "var(--muted)" }}>
                本条暂无更长的来源导读存档，以上摘要即为本站存档内容。完整内容请见原文。
              </p>
            )}
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-4 text-sm" style={{ color: "var(--muted)" }}>
            <button onClick={() => playAt(flatIndexOf(detailItem))} className="underline underline-offset-4" style={{ color: "var(--accent)" }}>
              {isCurrent && playing ? "暂停播报" : "播报本条"}
            </button>
            <a href={detailItem.url} target="_blank" rel="noreferrer" className="underline underline-offset-4">
              原文 ↗
            </a>
          </div>
        </article>
        <div className="mt-6 flex flex-wrap gap-4 text-sm">
          <button
            disabled={!prev}
            onClick={() => prev && goDetail(prev)}
            className="underline underline-offset-4 disabled:no-underline"
            style={{ color: prev ? "var(--accent)" : "var(--muted)" }}
          >
            ← 上一张卡片
          </button>
          <button
            disabled={!next}
            onClick={() => next && goDetail(next)}
            className="underline underline-offset-4 disabled:no-underline"
            style={{ color: next ? "var(--accent)" : "var(--muted)" }}
          >
            下一张卡片 →
          </button>
          <span style={{ color: "var(--muted)" }}>
            {detailPos >= 0 ? `${detailPos + 1} / ${detailSiblings.length}` : ""}
          </span>
        </div>
      </main>
    );
  }

  return (
    <div data-theme={theme} style={{ background: "var(--bg)", color: "var(--text)" }} className="min-h-screen">
      <audio ref={audioRef} onEnded={onAudioEnded} onError={onAudioError} preload="none" />
      <div className="mx-auto px-5 py-6" style={{ maxWidth: 760 }}>
        <header className="flex items-start justify-between gap-4 pb-5" style={{ borderBottom: "1px solid var(--border)" }}>
          <div>
            <div className="text-xs tracking-widest" style={{ color: "var(--muted)" }}>
              NEWS_REPORTS · 每日 07:30 更新
            </div>
            <h1 className="headline headline-1 mt-2">每日新闻播报</h1>
            <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
              {data.date} · 政治 / 军事 / 时事 / 科研 / 大模型 / 人工智能 / 今日值得一试
            </p>
          </div>
          <label htmlFor="theme-select" className="shrink-0 text-xs" style={{ color: "var(--muted)" }}>
            主题
            <select
              id="theme-select"
              aria-label="切换主题"
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              className="ml-2 px-2 py-1.5 rounded-md border bg-transparent text-sm"
              style={{ borderColor: "var(--border)", color: "var(--text)" }}
            >
              {THEMES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                  {t.id === "magazine" ? "（默认）" : ""}
                </option>
              ))}
            </select>
          </label>
        </header>

        {data.is_sample && (
          <p className="mt-4 text-xs" style={{ color: "var(--muted)" }}>
            本页为标注的示例数据，不是真实新闻。
          </p>
        )}

        <section className="mt-5 flex flex-wrap items-center gap-3 text-sm" style={{ borderBottom: "1px solid var(--border)" }}>
          <strong className="text-sm">🎧 今日播报</strong>
          <button aria-label="上一条" onClick={() => flat.length && playAt((index - 1 + flat.length) % flat.length)}>⏮ 上一条</button>
          <button aria-label={playing ? "暂停播报" : "播放全部"} onClick={togglePlay} style={{ color: "var(--accent)" }} className="font-bold">
            {playing ? "⏸ 暂停" : "▶ 播放全部"}
          </button>
          <button aria-label="下一条" onClick={() => flat.length && playAt((index + 1) % flat.length)}>下一条 ⏭</button>
          <button aria-label="后退 15 秒" onClick={() => skip(-15)}>−15s</button>
          <button aria-label="前进 15 秒" onClick={() => skip(15)}>+15s</button>
          <label htmlFor="rate-select" style={{ color: "var(--muted)" }}>
            倍速
            <select id="rate-select" aria-label="播报倍速" value={rate} onChange={(e) => changeRate(Number(e.target.value))} className="ml-1 px-1 py-0.5 rounded border bg-transparent" style={{ borderColor: "var(--border)", color: "var(--text)" }}>
              {[0.75, 1, 1.2, 1.5, 2].map((r) => (
                <option key={r} value={r}>{r}x</option>
              ))}
            </select>
          </label>
          <label htmlFor="voice-select" style={{ color: "var(--muted)" }}>
            音色
            <select id="voice-select" aria-label="朗读音色" value={voiceName} onChange={(e) => changeVoice(e.target.value)} className="ml-1 px-1 py-0.5 rounded border bg-transparent" style={{ borderColor: "var(--border)", color: "var(--text)", maxWidth: 160 }}>
              <option value="auto">自动优选</option>
              {voices.map((v) => (
                <option key={v.name} value={v.name}>{v.name}</option>
              ))}
            </select>
          </label>
          <span className="truncate" style={{ color: "var(--muted)" }}>
            {current ? `${index + 1}/${flat.length} · ${current.title}` : ""}
            {useSpeech ? " · 浏览器朗读兜底" : ""}
          </span>
        </section>
        {notice && <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>{notice}</p>}

        {view.type === "home" && renderHome()}
        {view.type === "category" && renderCategory()}
        {view.type === "detail" && renderDetail()}

        <footer className="mt-12 pt-5 text-xs text-center" style={{ borderTop: "1px solid var(--border)", color: "var(--muted)" }}>
          详情页为来源导读存档，不全文搬运；完整内容请见原文链接。
        </footer>
      </div>
    </div>
  );
}
