"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/* Category colours are kept, but used sparingly after the 2026-11-04
   redesign: a small dot + label, not a full-colour title or colour block.
   That keeps categories recognisable without crowding the page. */
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

export default function NewsApp({ data }) {
  const sections = data?.sections || [];
  const flat = useMemo(
    () => sections.flatMap((s) => (s.items || []).map((it) => ({ ...it, sectionName: s.name }))),
    [sections]
  );

  const [theme, setTheme] = useState("magazine");
  const [filter, setFilter] = useState("all");
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [useSpeech, setUseSpeech] = useState(false);
  const [notice, setNotice] = useState("");
  const [rate, setRate] = useState(1.2);

  const audioRef = useRef(null);
  const playingRef = useRef(false);
  const indexRef = useRef(0);
  const speechTimerRef = useRef(null);

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
    return () => {
      try {
        window.speechSynthesis?.cancel();
        if (speechTimerRef.current) clearTimeout(speechTimerRef.current);
      } catch {}
    };
  }, []);

  const current = flat[index] || null;

  /* Browser speech used to sound stiff because the whole title+summary
     went out as one long utterance in the browser's default voice.
     Fix (2026-11-04): pick the most natural zh-CN female voice available
     (Xiaoxiao / Yunyang / Microsoft natural / Google zh-CN first), split
     the text into sentence-sized chunks, and leave a short pause between
     chunks and between items. MP3 remains preferred when it exists. */
  function pickVoice() {
    try {
      const voices = window.speechSynthesis.getVoices() || [];
      const zh = voices.filter((v) => (v.lang || "").toLowerCase().startsWith("zh"));
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
      if (p.length <= 60) {
        chunks.push(p);
      } else {
        // Long sentence: split on commas so no single utterance drags on.
        for (const c of p.split(/(?<=，)/g).map((s) => s.trim()).filter(Boolean)) chunks.push(c);
      }
    }
    return chunks.length ? chunks : [text];
  }

  function speak(item, idx) {
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
      let ci = 0;
      const speakChunk = () => {
        if (!playingRef.current || idx !== indexRef.current) return;
        if (ci >= chunks.length) {
          if (playingRef.current && idx === indexRef.current) {
            speechTimerRef.current = setTimeout(() => playAt((idx + 1) % flat.length, false), 350);
          }
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
    if (!el) {
      setUseSpeech(true);
      speak(item, i);
      return;
    }
    el.src = item.audio_path || "";
    el.playbackRate = rate;
    el.play().catch(() => {
      setUseSpeech(true);
      setNotice("本条暂无预生成音频，已切换为浏览器朗读（按句分段、优选自然女声）。");
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
      speak(current, index);
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
    if (useSpeech && playing && current) speak(current, index);
  }

  function onAudioEnded() {
    if (flat.length) playAt((index + 1) % flat.length, false);
  }
  function onAudioError() {
    if (current && !useSpeech) {
      setUseSpeech(true);
      setNotice("本条暂无预生成音频，已切换为浏览器朗读（按句分段、优选自然女声）。");
      speak(current, index);
    }
  }

  const visibleSections = filter === "all" ? sections : sections.filter((s) => s.id === filter);

  function renderItem(item, isTop) {
    const color = CATEGORY_COLORS[item.category] || "#374151";
    const isCurrent = current && current.id === item.id;
    return (
      <article key={item.id} className="py-5" style={{ borderTop: "1px solid var(--border)" }}>
        <div className="flex items-center gap-2 text-xs tracking-wide" style={{ color }}>
          <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: color }} />
          {item.sectionName || item.category}
          {isCurrent && playing ? <span style={{ color: "var(--muted)" }}>· 正在播报</span> : null}
        </div>
        <h3 className={`headline mt-2 ${isTop ? "headline-3-top" : "headline-3"}`}>
          {item.title}
        </h3>
        <p className="mt-2 text-[15px] leading-relaxed" style={{ color: "var(--muted)" }}>
          {item.summary}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-4 text-sm" style={{ color: "var(--muted)" }}>
          <button onClick={() => playAt(flat.findIndex((f) => f.id === item.id))} className="underline underline-offset-4" style={{ color: "var(--accent)" }}>
            {isCurrent && playing ? "暂停播报" : "播报本条"}
          </button>
          <a href={item.url} target="_blank" rel="noreferrer" className="underline underline-offset-4">
            原文 ↗
          </a>
          <span>来源：{item.source}</span>
        </div>
      </article>
    );
  }

  return (
    <div data-theme={theme} style={{ background: "var(--bg)", color: "var(--text)" }} className="min-h-screen">
      <audio ref={audioRef} onEnded={onAudioEnded} onError={onAudioError} preload="none" />
      <div className="mx-auto px-5 py-6" style={{ maxWidth: 760 }}>
        {/* Top bar: brand left, theme dropdown top-right, small. */}
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

        {/* Compact player: one quiet row, not a large sticky panel. */}
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
          <span className="truncate" style={{ color: "var(--muted)" }}>
            {current ? `${index + 1}/${flat.length} · ${current.title}` : ""}
            {useSpeech ? " · 浏览器朗读兜底" : ""}
          </span>
        </section>
        {notice && <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>{notice}</p>}

        {/* Category filter: plain text links, not a row of buttons. */}
        <nav aria-label="按分类筛选" className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <button onClick={() => setFilter("all")} style={{ color: filter === "all" ? "var(--accent)" : "var(--muted)", fontWeight: filter === "all" ? 700 : 400 }}>
            全部
          </button>
          {sections.map((s) => (
            <button key={s.id} onClick={() => setFilter(s.id)} style={{ color: filter === s.id ? CATEGORY_COLORS[s.id] : "var(--muted)", fontWeight: filter === s.id ? 700 : 400 }}>
              {s.name}
            </button>
          ))}
        </nav>

        <main className="mt-8 space-y-10">
          {visibleSections.map((section) => (
            <section key={section.id}>
              <h2 className="headline headline-2 flex items-baseline gap-2">
                <span className="inline-block w-2 h-4 rounded-sm" style={{ background: CATEGORY_COLORS[section.id] }} />
                {section.name}
                <span className="text-sm font-normal" style={{ color: "var(--muted)" }}>
                  {section.items?.length || 0} 条
                </span>
              </h2>
              <div className="mt-1">
                {section.items.map((item, i) => renderItem({ ...item, sectionName: section.name }, i === 0 && section.id === sections[0]?.id))}
              </div>
            </section>
          ))}
        </main>

        <footer className="mt-12 pt-5 text-xs text-center" style={{ borderTop: "1px solid var(--border)", color: "var(--muted)" }}>
          只展示标题、摘要与原文链接，不全文搬运；图片优先用原文配图，AI 图须标注。
        </footer>
      </div>
    </div>
  );
}
