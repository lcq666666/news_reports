"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/* Website v2, 2026-11-04 (user-approved 20:17, synced from local
   mini.html v2 so the site matches the mini page):
   - Home: one LARGE card per section. The tools section
     (今日值得一试) goes FIRST and is the full-width hero card;
     politics is a normal card, other sections keep their order.
     (Playback order is untouched: flat() still follows the data
     file order, only the home display order changes.)
   - Click a home card -> that section's sub-page (all its cards).
     Click a card/title -> detail sub-page: title, image ONLY when
     item.image_url really exists, bold summary, stored excerpt,
     then a References section at the end (original link, source,
     and a title search explicitly labelled as a search entry, not
     evidence), prev/next within the section, play, original link.
   - Tools sub-page adds the labelled HelloGitHub monthly picks
     (issue 127, 2026-10-28, monthly, NOT today's news, NOT counted
     in the 58). No invented references or images anywhere.
   - 5 themes are deliberately different layouts, not just colours
     (see globals.css): magazine hero/serif/staggered/fade-slide,
     newspaper hairlines/square/small-caps/one-column/no-motion,
     dark monospace/glow/slide, light-card rounded/shadow/spring,
     podcast timeline/prominent player. Theme switch stays a small
     dropdown at the top-right. Player (MP3 probe -> browser speech
     fallback, rate, voice picker, sentence chunks) is unchanged.
   - Data source unchanged: page.js loads data/YYYY-MM-DD.json at
     build time. No title/summary/url/source/order is changed here.
   Note: the main site never had prev/next-day switching (only the
   mini page fetches public/data/<date>.json at runtime), so there
   is no day navigation to lose here. */

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
  { id: "dark", label: "暗夜极客" },
  { id: "light-card", label: "轻量卡片" },
  { id: "podcast", label: "播客时间线" },
];

const SECTION_DESC = {
  politics: "政坛动向与政策信号",
  military: "防务动态与军事观察",
  current: "正在发生的时事",
  research: "科研进展与学术动态",
  "large-models": "大模型发布与行业动向",
  ai: "人工智能应用与讨论",
  tools: "好用的项目、工具与资源，不限量",
};

// HelloGitHub monthly picks, labelled as monthly (NOT today's news).
// Verified 2026-11-04: RSS https://hellogithub.com/rss, latest issue
// 127, published 2026-10-28. Descriptions are short summaries of the
// issue page itself; images are the issue page's own images.
const HG_PICKS = [
  {
    title: "Filee · 离线文件格式转换器",
    summary:
      "按住 Ctrl 拖动文件，光标旁弹出格式圆环，放到目标格式即完成转换，支持 200 多种格式，文件全程不上传。",
    url: "https://hellogithub.com/periodical/volume/127",
    source: "HelloGitHub 第 127 期（月刊，2026-10-28）",
    image_url:
      "https://img-global.cheatsheet.store/i/WtL0ZjK9AeU3vdo_1792741211.jpg",
  },
  {
    title: "omni-tools · 可自托管的全能在线工具箱",
    summary:
      "图片、音视频、PDF、文本、日期时间、数学计算等日常工具集合，所有文件都在本地浏览器中处理。",
    url: "https://hellogithub.com/periodical/volume/127",
    source: "HelloGitHub 第 127 期（月刊，2026-10-28）",
    image_url:
      "https://img-global.cheatsheet.store/i/2QeJjvZhLWdbo3I_1792849243.png",
  },
  {
    title: "magpie · 一键切换 AI 编程助手的模型",
    summary:
      "通过本地网关转换接口格式，让不同编程助手用上不同厂商的模型，额度用完后自动切换账号。",
    url: "https://hellogithub.com/periodical/volume/127",
    source: "HelloGitHub 第 127 期（月刊，2026-10-28）",
    image_url:
      "https://img-global.cheatsheet.store/i/yabu8ZKGAxBz5o4_1792766512.png",
  },
  {
    title: "miniserve · 极简的共享文件 HTTP 服务器",
    summary:
      "一个文件就能通过 HTTP 共享文件和目录，支持认证、上传、打包下载、搜索、扫码访问和 WebDAV。",
    url: "https://hellogithub.com/periodical/volume/127",
    source: "HelloGitHub 第 127 期（月刊，2026-10-28）",
    image_url:
      "https://img-global.cheatsheet.store/i/CW0eI7EM62BsUfQ_1792929788.png",
  },
  {
    title: "PicLite · 极简的本地图片压缩工具",
    summary:
      "批量压缩、拖动对比画质、格式转换、缩放和水印，自动比较候选结果选出体积更小的文件，全程本机处理。",
    url: "https://hellogithub.com/periodical/volume/127",
    source: "HelloGitHub 第 127 期（月刊，2026-10-28）",
    image_url:
      "https://img-global.cheatsheet.store/i/6aeiVF3K7w5c4Ux_1792935209.jpg",
  },
];

export default function NewsApp({ data }) {
  const sections = data?.sections || [];
  // Home display order only: tools first as hero, others keep order.
  const homeSections = useMemo(
    () =>
      [...sections].sort((a, b) => {
        if (a.id === "tools") return -1;
        if (b.id === "tools") return 1;
        return 0;
      }),
    [sections]
  );
  const flat = useMemo(
    () =>
      sections.flatMap((s) =>
        (s.items || []).map((it) => ({ ...it, sectionName: s.name }))
      ),
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
    view.type === "detail"
      ? flat.find((f) => f.id === view.itemId) || null
      : null;
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
            speechTimerRef.current = setTimeout(
              () => playAt((idx + 1) % flat.length, false),
              350
            );
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
      typeof window !== "undefined" &&
      window.location.pathname.startsWith("/news_reports")
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
      setNotice(
        "浏览器朗读模式下 ±15 秒在真实 MP3 播放时生效，请用上一条 / 下一条切换。"
      );
      return;
    }
    el.currentTime = Math.max(
      0,
      Math.min(el.duration, el.currentTime + seconds)
    );
  }

  function changeRate(next) {
    setRate(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
    if (useSpeech && playing && current)
      speak(current, index, speechChunkRef.current);
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
    if (useSpeech && playing && current)
      speak(current, index, speechChunkRef.current);
  }

  function goDetail(item) {
    setView({ type: "detail", itemId: item.id });
  }
  function flatIndexOf(item) {
    return flat.findIndex((f) => f.id === item.id);
  }

  function renderHome() {
    return (
      <main className="home-main">
        <p className="home-intro">
          一张大卡片就是一个板块，点卡片进板块子页，再点标题进详情子页，详情末尾有引用区。
        </p>
        <div className="grid-layout">
          {homeSections.map((s, idx) => {
            const color = CATEGORY_COLORS[s.id] || "#374151";
            const items = s.items || [];
            return (
              <article
                key={s.id}
                onClick={() => setView({ type: "category", id: s.id })}
                className={`home-card${idx === 0 ? " hero" : ""}`}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setView({ type: "category", id: s.id });
                }}
              >
                <div className="meta" style={{ color }}>
                  <span className="dot" style={{ background: color }} />
                  {s.name}
                  <span className="meta-count">{items.length} 条</span>
                </div>
                <h3>{s.name}</h3>
                <p className="sec-desc">{SECTION_DESC[s.id] || ""}</p>
                {items.slice(0, 3).map((it) => (
                  <p key={it.id} className="top-headline">
                    · {it.title}
                  </p>
                ))}
                <div className="go">进入板块 →</div>
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
      <main className="home-main">
        <button
          onClick={() => setView({ type: "home" })}
          className="back-link"
        >
          ← 全部板块
        </button>
        <h2 className="headline headline-2 section-title">
          <span
            className="inline-block w-2 h-4 rounded-sm"
            style={{ background: color }}
          />
          {section.name}
          <span className="section-count">
            {(section.items || []).length} 条
          </span>
        </h2>
        <p className="sec-desc">{SECTION_DESC[section.id] || ""}</p>
        <div className="grid-layout">
          {(section.items || []).map((item) => {
            const isCurrent = current && current.id === item.id;
            return (
              <article key={item.id} className="cat-card">
                <div
                  className="card-click"
                  onClick={() => goDetail(item)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") goDetail(item);
                  }}
                >
                  <div className="meta" style={{ color }}>
                    <span className="dot" style={{ background: color }} />
                    {section.name}
                    {isCurrent && playing ? (
                      <span className="meta-count">· 正在播报</span>
                    ) : null}
                  </div>
                  <h3>{item.title}</h3>
                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt=""
                      loading="lazy"
                      className="card-img"
                    />
                  ) : null}
                  <p className="card-summary">{item.summary}</p>
                  <div className="go">查看详情 →</div>
                </div>
                <div className="actions">
                  <button
                    onClick={() => playAt(flatIndexOf(item))}
                    className="action-link"
                  >
                    {isCurrent && playing ? "暂停播报" : "播报本条"}
                  </button>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="action-muted"
                  >
                    原文 ↗
                  </a>
                  <span>来源：{item.source}</span>
                </div>
              </article>
            );
          })}
          {section.id === "tools" && (
            <>
              <div className="hg-head">
                <h3>
                  HelloGitHub 月刊精选 · 第 127 期（2026-10-28，月刊，非当日新闻）
                </h3>
                <p>
                  以下 5 条来自已核实的 HelloGitHub 月刊最新一期，单独标注，不计入今日
                  58 条。
                </p>
              </div>
              {HG_PICKS.map((pick) => (
                <article key={pick.title} className="cat-card">
                  <div className="meta" style={{ color }}>
                    <span className="dot" style={{ background: color }} />
                    月刊精选
                  </div>
                  <h3>{pick.title}</h3>
                  {pick.image_url ? (
                    <img
                      src={pick.image_url}
                      alt=""
                      loading="lazy"
                      className="card-img"
                    />
                  ) : null}
                  <p className="card-summary">{pick.summary}</p>
                  <div className="actions">
                    <a
                      href={pick.url}
                      target="_blank"
                      rel="noreferrer"
                      className="action-link"
                    >
                      HelloGitHub 第 127 期 ↗
                    </a>
                    <span>来源：{pick.source}</span>
                  </div>
                </article>
              ))}
            </>
          )}
        </div>
      </main>
    );
  }

  function renderDetail() {
    if (!detailItem) {
      return (
        <main className="home-main">
          <p className="muted-text">这条详情找不到了，请回首页。</p>
          <button
            onClick={() => setView({ type: "home" })}
            className="back-link mt-4"
          >
            ← 回全部板块
          </button>
        </main>
      );
    }
    const color = CATEGORY_COLORS[detailItem.category] || "#374151";
    const excerpt = (detailItem.excerpt || "").trim();
    const prev = detailPos > 0 ? detailSiblings[detailPos - 1] : null;
    const next =
      detailPos >= 0 && detailPos < detailSiblings.length - 1
        ? detailSiblings[detailPos + 1]
        : null;
    const isCurrent = current && current.id === detailItem.id;
    const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(
      detailItem.title
    )}`;
    return (
      <main className="home-main">
        <div className="detail-back-row">
          <button onClick={() => setView({ type: "home" })} className="back-link">
            ← 全部板块
          </button>
          <button
            onClick={() =>
              setView({ type: "category", id: detailItem.category })
            }
            className="back-link"
          >
            ← {detailSection ? detailSection.name : "返回板块"}
          </button>
        </div>
        <article className="detail-card">
          <div className="meta" style={{ color }}>
            <span className="dot" style={{ background: color }} />
            {detailItem.sectionName || detailItem.category}
            <span className="meta-count">
              · 来源：{detailItem.source} · {data.date}
            </span>
          </div>
          <h2 className="headline headline-2 detail-title">{detailItem.title}</h2>
          {detailItem.image_url ? (
            <img
              src={detailItem.image_url}
              alt=""
              loading="lazy"
              className="card-img"
            />
          ) : null}
          <p className="detail-summary">{detailItem.summary}</p>
          <div className="detail-excerpt">
            <div className="block-label">站内存档导读（来源导读存档，非全文）</div>
            {excerpt && excerpt.length > 80 && excerpt !== detailItem.summary ? (
              <p>{excerpt}</p>
            ) : (
              <p>
                本条暂无更长的来源导读存档，以上摘要即为本站存档内容。完整内容请见原文。
              </p>
            )}
          </div>
          <div className="refs">
            <div className="block-label">引用 · 这条新闻的依据与来源</div>
            <ul>
              <li>
                原文链接：
                <a href={detailItem.url} target="_blank" rel="noreferrer">
                  {detailItem.url}
                </a>
              </li>
              <li>来源：{detailItem.source}</li>
              <li>
                更多报道检索（按标题检索，不作为证据本身）：
                <a href={searchUrl} target="_blank" rel="noreferrer">
                  以标题检索更多渠道 ↗
                </a>
              </li>
            </ul>
            <p className="refs-note">
              今天的数据每条只有一个原文链接和一个来源字符串，本页不编造更多引用；有多个渠道时会在这里逐条列出。
            </p>
          </div>
          <div className="actions">
            <button
              onClick={() => playAt(flatIndexOf(detailItem))}
              className="action-link"
            >
              {isCurrent && playing ? "暂停播报" : "播报本条"}
            </button>
            <a
              href={detailItem.url}
              target="_blank"
              rel="noreferrer"
              className="action-muted"
            >
              原文 ↗
            </a>
          </div>
        </article>
        <div className="detail-nav-row">
          <button
            disabled={!prev}
            onClick={() => prev && goDetail(prev)}
            className="back-link"
          >
            ← 上一张卡片
          </button>
          <button
            disabled={!next}
            onClick={() => next && goDetail(next)}
            className="back-link"
          >
            下一张卡片 →
          </button>
          <span className="muted-text">
            {detailPos >= 0 ? `${detailPos + 1} / ${detailSiblings.length}` : ""}
          </span>
        </div>
      </main>
    );
  }

  return (
    <div
      data-theme={theme}
      style={{ background: "var(--bg)", color: "var(--text)" }}
      className="min-h-screen"
    >
      <audio
        ref={audioRef}
        onEnded={onAudioEnded}
        onError={onAudioError}
        preload="none"
      />
      <div className="mx-auto px-5 py-6" style={{ maxWidth: 760 }}>
        <header
          className="site-header flex items-start justify-between gap-4 pb-5"
        >
          <div>
            <div className="kicker">NEWS_REPORTS · 每日 07:30 更新</div>
            <h1 className="headline headline-1 mt-2">每日新闻播报</h1>
            <p className="mt-1 text-sm muted-text">
              {data.date} · 政治 / 军事 / 时事 / 科研 / 大模型 /
              人工智能 / 今日值得一试
            </p>
          </div>
          <label
            htmlFor="theme-select"
            className="shrink-0 text-xs muted-text"
          >
            主题
            <select
              id="theme-select"
              aria-label="切换主题"
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              className="theme-select ml-2 px-2 py-1.5 rounded-md border bg-transparent text-sm"
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
          <p className="mt-4 text-xs muted-text">
            本页为标注的示例数据，不是真实新闻。
          </p>
        )}

        <section className="player mt-5 flex flex-wrap items-center gap-3 text-sm">
          <strong className="text-sm">🎧 今日播报</strong>
          <button
            aria-label="上一条"
            onClick={() =>
              flat.length && playAt((index - 1 + flat.length) % flat.length)
            }
          >
            ⏮ 上一条
          </button>
          <button
            aria-label={playing ? "暂停播报" : "播放全部"}
            onClick={togglePlay}
            className="player-primary font-bold"
          >
            {playing ? "⏸ 暂停" : "▶ 播放全部"}
          </button>
          <button
            aria-label="下一条"
            onClick={() => flat.length && playAt((index + 1) % flat.length)}
          >
            下一条 ⏭
          </button>
          <button aria-label="后退 15 秒" onClick={() => skip(-15)}>
            −15s
          </button>
          <button aria-label="前进 15 秒" onClick={() => skip(15)}>
            +15s
          </button>
          <label htmlFor="rate-select" className="muted-text">
            倍速
            <select
              id="rate-select"
              aria-label="播报倍速"
              value={rate}
              onChange={(e) => changeRate(Number(e.target.value))}
              className="ml-1 px-1 py-0.5 rounded border bg-transparent"
            >
              {[0.75, 1, 1.2, 1.5, 2].map((r) => (
                <option key={r} value={r}>
                  {r}x
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="voice-select" className="muted-text">
            音色
            <select
              id="voice-select"
              aria-label="朗读音色"
              value={voiceName}
              onChange={(e) => changeVoice(e.target.value)}
              className="ml-1 px-1 py-0.5 rounded border bg-transparent"
              style={{ maxWidth: 160 }}
            >
              <option value="auto">自动优选</option>
              {voices.map((v) => (
                <option key={v.name} value={v.name}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          <span className="truncate muted-text">
            {current ? `${index + 1}/${flat.length} · ${current.title}` : ""}
            {useSpeech ? " · 浏览器朗读兜底" : ""}
          </span>
        </section>
        {notice && <p className="mt-2 text-sm muted-text">{notice}</p>}

        {view.type === "home" && renderHome()}
        {view.type === "category" && renderCategory()}
        {view.type === "detail" && renderDetail()}

        <footer className="site-footer mt-12 pt-5 text-xs text-center muted-text">
          详情页为来源导读存档，不全文搬运；完整内容请见原文链接。
        </footer>
      </div>
    </div>
  );
}
