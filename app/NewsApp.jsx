"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/* Category colours stay identical across all themes, by design. */
export const CATEGORY_COLORS = {
  politics: "#B91C1C", // 政治：深红
  military: "#14532D", // 军事：深绿
  current: "#EA580C", // 时事：橙
  research: "#2563EB", // 科研：蓝
  "large-models": "#7C3AED", // 大模型：紫
  ai: "#0F766E", // 人工智能：青
  tools: "#92400E", // 今日值得一试：棕
};

const THEMES = [
  { id: "magazine", label: "杂志大图", desc: "默认主题，大图 + 网格" },
  { id: "newspaper", label: "头版日报", desc: "报纸版面，衬线大标题" },
  { id: "dark", label: "深色极客", desc: "深色背景，适合夜间" },
  { id: "light-card", label: "轻量卡片", desc: "白底圆角卡片，刷起来最顺" },
  { id: "podcast", label: "播客晨报", desc: "听优先，播放器置顶" },
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
  const [progress, setProgress] = useState(0);

  const audioRef = useRef(null);
  const playingRef = useRef(false);
  const indexRef = useRef(0);

  // Theme persistence: localStorage only, no server round-trip.
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

  // Stop speech when leaving the page / unmounting.
  useEffect(() => {
    return () => {
      try {
        window.speechSynthesis?.cancel();
      } catch {}
    };
  }, []);

  const current = flat[index] || null;

  function speak(item, idx) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setNotice("此浏览器不支持朗读兜底，正式版请使用预生成的 MP3。");
      setPlaying(false);
      return;
    }
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(`${item.title}。${item.summary || ""}`);
      u.lang = "zh-CN";
      u.rate = rate;
      u.onend = () => {
        // Advance only if playback was not paused in the meantime.
        if (playingRef.current && idx === indexRef.current) playAt((idx + 1) % flat.length, false);
      };
      window.speechSynthesis.speak(u);
    } catch {
      setNotice("浏览器朗读失败，正式版请使用预生成的 MP3。");
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
      // Placeholder audio paths intentionally have no real MP3 behind them
      // in this skeleton, so the browser-voice fallback takes over.
      setUseSpeech(true);
      setNotice("示例音频占位（无真实 MP3），已切换为浏览器朗读兜底。正式版将播放 Edge-TTS 预生成的音频。");
      speak(item, i);
    });
  }

  function togglePlay() {
    if (!current) return;
    if (playing) {
      try {
        audioRef.current?.pause();
        window.speechSynthesis?.cancel();
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
      setNotice("浏览器朗读模式下 ±15 秒在真实 MP3 播放时生效，示例阶段请用上一条 / 下一条切换。");
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
      setNotice("示例音频占位（无真实 MP3），已切换为浏览器朗读兜底。正式版将播放 Edge-TTS 预生成的音频。");
      speak(current, index);
    }
  }

  const visibleSections = filter === "all" ? sections : sections.filter((s) => s.id === filter);
  const containerClass =
    theme === "magazine"
      ? "max-w-6xl"
      : theme === "newspaper" || theme === "podcast"
        ? "max-w-3xl"
        : "max-w-5xl";

  function renderItem(item, isTop) {
    const color = CATEGORY_COLORS[item.category] || "#374151";
    const isCurrent = current && current.id === item.id;
    return (
      <article
        key={item.id}
        style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)" }}
        className="overflow-hidden"
      >
        <div
          className="flex items-center justify-center px-4 py-8 text-center"
          style={{ background: `linear-gradient(135deg, ${color}22, ${color}55)` }}
        >
          <div>
            <div className="text-xs tracking-widest" style={{ color }}>
              示例配图占位 · 非新闻现场照片
            </div>
            <div className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
              {item.sectionName || item.category}
            </div>
          </div>
        </div>
        <div className="p-4">
          <span
            className="inline-block px-2 py-0.5 text-xs font-bold text-white rounded"
            style={{ background: color }}
          >
            {item.sectionName || item.category}
          </span>
          <h3
            className={`headline font-bold mt-2 leading-snug ${isTop ? "text-xl md:text-2xl" : "text-lg"}`}
            style={{ color }}
          >
            {item.title}
          </h3>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
            {item.summary}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
            <button
              onClick={() => playAt(flat.findIndex((f) => f.id === item.id))}
              className="px-3 py-1.5 rounded-full font-bold text-white"
              style={{ background: color }}
            >
              {isCurrent && playing ? "⏸ 正在播报" : "▶ 播报本条"}
            </button>
            <a href={item.url} target="_blank" rel="noreferrer" className="underline">
              原文链接 ↗
            </a>
            <span style={{ color: "var(--muted)" }}>来源：{item.source}</span>
            {item.audio_path && (
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                音频：{item.audio_path}
              </span>
            )}
          </div>
        </div>
      </article>
    );
  }

  return (
    <div data-theme={theme} style={{ background: "var(--bg)", color: "var(--text)" }} className="min-h-screen">
      <audio
        ref={audioRef}
        onEnded={onAudioEnded}
        onError={onAudioError}
        onTimeUpdate={(e) => {
          const el = e.currentTarget;
          if (el.duration) setProgress(el.currentTime / el.duration);
        }}
        preload="none"
      />
      <div className={`mx-auto px-4 py-6 ${containerClass}`}>
        <header className="text-center">
          <div className="text-xs tracking-widest" style={{ color: "var(--muted)" }}>
            NEWS_REPORTS · 每日 07:30 更新（骨架版为示例数据）
          </div>
          <h1 className="headline text-4xl md:text-5xl font-bold mt-2">每日新闻播报</h1>
          <p className="mt-2" style={{ color: "var(--muted)" }}>
            {data.date} · 政治 / 军事 / 时事 / 科研 / 大模型 / 人工智能 / 今日值得一试
          </p>
          {data.is_sample && (
            <p className="mt-2 inline-block px-3 py-1 rounded-full text-sm font-bold bg-yellow-200 text-yellow-900">
              ⚠ 本页全部为标注的示例数据，不是真实新闻
            </p>
          )}
        </header>

        {/* Theme switcher: all 5 themes, persisted in localStorage, default magazine. */}
        <section
          className="mt-6 p-4"
          style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)" }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <strong>主题切换：</strong>
            {THEMES.map((t) => (
              <button
                key={t.id}
                onClick={() => setTheme(t.id)}
                className={`px-3 py-1.5 rounded-full text-sm font-bold ${theme === t.id ? "text-white" : ""}`}
                style={{
                  background: theme === t.id ? "var(--accent)" : "transparent",
                  border: "1px solid var(--border)",
                  color: theme === t.id ? "#fff" : "var(--text)",
                }}
                title={t.desc}
              >
                {t.label}
                {t.id === "magazine" ? "（默认）" : ""}
              </button>
            ))}
          </div>
          <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
            当前主题：{THEMES.find((t) => t.id === theme)?.label} · 选择会保存在浏览器 localStorage，下次打开仍是这个主题。分类颜色在所有主题下保持一致。
          </p>
        </section>

        {/* Audio player: sequential playlist, 1.2x default, ±15s, speed control. */}
        <section
          className="mt-4 p-4 sticky top-2 z-10 shadow"
          style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)" }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <strong>🎧 今日播报</strong>
            <button onClick={() => flat.length && playAt((index - 1 + flat.length) % flat.length)} className="px-3 py-1.5 rounded-full border">
              ⏮ 上一条
            </button>
            <button
              onClick={togglePlay}
              className="px-4 py-1.5 rounded-full font-bold text-white"
              style={{ background: "var(--accent)" }}
            >
              {playing ? "⏸ 暂停" : "▶ 播放全部"}
            </button>
            <button onClick={() => flat.length && playAt((index + 1) % flat.length)} className="px-3 py-1.5 rounded-full border">
              下一条 ⏭
            </button>
            <button onClick={() => skip(-15)} className="px-3 py-1.5 rounded-full border" title="真实 MP3 下生效">
              −15 秒
            </button>
            <button onClick={() => skip(15)} className="px-3 py-1.5 rounded-full border" title="真实 MP3 下生效">
              +15 秒
            </button>
            <label className="text-sm">
              倍速：
              <select
                value={rate}
                onChange={(e) => changeRate(Number(e.target.value))}
                className="ml-1 px-2 py-1 rounded border bg-transparent"
              >
                {[0.75, 1, 1.2, 1.5, 2].map((r) => (
                  <option key={r} value={r}>
                    {r}x
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
            正在播报（{index + 1}/{flat.length}）：{current ? current.title : "—"}
            {useSpeech ? " · 当前为浏览器朗读兜底" : ""}
          </div>
          <div className="mt-2 h-2 rounded bg-gray-200 overflow-hidden">
            <div className="h-full" style={{ width: `${Math.round(progress * 100)}%`, background: "var(--accent)" }} />
          </div>
          {notice && <p className="mt-2 text-sm text-amber-700">{notice}</p>}
          <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
            骨架阶段音频路径为占位路径，无真实 MP3 文件；正式版由 Edge-TTS 预生成，女声、默认 1.2 倍速，每条单独一个音频文件。
          </p>
        </section>

        {/* Category filter */}
        <nav className="mt-6 flex flex-wrap gap-2">
          <button
            onClick={() => setFilter("all")}
            className="px-3 py-1.5 rounded-full text-sm font-bold border"
            style={{ background: filter === "all" ? "var(--accent)" : "transparent", color: filter === "all" ? "#fff" : "var(--text)" }}
          >
            全部
          </button>
          {sections.map((s) => (
            <button
              key={s.id}
              onClick={() => setFilter(s.id)}
              className="px-3 py-1.5 rounded-full text-sm font-bold border"
              style={{ background: filter === s.id ? CATEGORY_COLORS[s.id] : "transparent", color: filter === s.id ? "#fff" : "var(--text)" }}
            >
              {s.name}
            </button>
          ))}
        </nav>

        {/* Magazine hero: first item overall, large. Other themes use the same sections below. */}
        {theme === "magazine" && filter === "all" && flat[0] && (
          <section className="mt-6">
            <div className="text-xs tracking-widest mb-2" style={{ color: "var(--muted)" }}>
              今日头条
            </div>
            {renderItem(flat[0], true)}
          </section>
        )}

        <main className="mt-6 space-y-8">
          {visibleSections.map((section) => (
            <section key={section.id}>
              <h2 className="headline text-2xl font-bold flex items-center gap-2">
                <span className="inline-block w-3 h-6 rounded" style={{ background: CATEGORY_COLORS[section.id] }} />
                {section.name}
                <span className="text-sm font-normal" style={{ color: "var(--muted)" }}>
                  {section.items?.length || 0} 条（示例，正式版按当天实际情况浮动）
                </span>
              </h2>
              <div
                className={`mt-3 grid gap-4 ${
                  theme === "magazine" || theme === "light-card" ? "md:grid-cols-2 lg:grid-cols-3" : "grid-cols-1"
                }`}
              >
                {section.items.map((item, i) => renderItem({ ...item, sectionName: section.name }, i === 0))}
              </div>
            </section>
          ))}
        </main>

        <footer className="mt-10 text-center text-sm pb-8" style={{ color: "var(--muted)" }}>
          <p>示例数据说明：标题、摘要、链接均为示例占位，不是真实新闻事件，正式版由每日生成流程替换。</p>
          <p>图片策略：原图优先 + 每天 1 张 AI 封面；本骨架用颜色块占位，避免使用假新闻照片。</p>
        </footer>
      </div>
    </div>
  );
}
