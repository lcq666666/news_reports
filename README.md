# news_reports — 每日新闻播报（骨架版）

中文每日新闻播报的本地骨架。当前页面全部使用**标注的示例数据**，不是真实新闻。
正式版由每日生成流程替换 `data/<日期>.json` 和 SQLite 内容。

## 已锁定的规格

- 前端：Next.js + Tailwind，静态导出（`output: "export"`），适合 GitHub Pages。
- 主题：5 套全保留，右上角有可见的主题切换按钮，选择保存在浏览器 `localStorage`，
  默认是**杂志大图**。另外 4 套：头版日报、深色极客、轻量卡片、播客晨报。
  分类颜色在所有主题下保持一致，便于识别：
  政治深红 `#B91C1C`、军事深绿 `#14532D`、时事橙 `#EA580C`、科研蓝 `#2563EB`、
  大模型紫 `#7C3AED`、人工智能青 `#0F766E`；标题加粗，头条更大。
- 板块：政治、军事、时事、科研、大模型、人工智能，另加**今日值得一试**
  （开源工具、教程、博客、好玩项目优先；其他有用的内容也可保留）。
  每类条数不固定，按当天实际情况浮动。
- 音频：每条单独一个音频文件，可顺序播放整期播报；默认倍速 1.2x，
  有 +15 秒 / −15 秒按钮和倍速选择。正式版用 Edge-TTS 预生成（女声），
  浏览器 Web Speech API 只做兜底。骨架阶段音频路径为占位路径，
  **没有真实 MP3 文件**，播放时会提示并切换为浏览器朗读。
- 图片：原图优先 + 每天 1 张 AI 封面。骨架用颜色块占位，
  避免使用假新闻照片；AI 配图在正式版中须标注“AI 配图，非新闻现场”。

## 目录结构

```text
news_reports/
├── app/                    # Next.js 页面（layout / page / NewsApp 客户端组件）
├── data/
│   ├── 2026-11-04.json     # 示例日数据（已标注 is_sample）
│   └── news.db             # 同日数据的 SQLite 文件（见 scripts/schema.sql）
├── scripts/
│   ├── generate_daily.py   # 抓取 / 去重 / 分类 / 摘要占位 / 写 JSON + SQLite
│   ├── requirements.txt    # feedparser, requests
│   └── schema.sql          # articles 表结构
├── public/audio/           # 正式版 MP3 落点（骨架为空目录，仅占位）
└── README.md
```

## 数据模型

- JSON：每天一个文件 `data/YYYY-MM-DD.json`，结构为
  `{ date, generated_at, is_sample, sections: [{ id, name, items: [...] }] }`，
  每条含 `id, category, title, summary, url, source, image_url, audio_path`。
- SQLite：`data/news.db`，表结构见 `scripts/schema.sql`：

```sql
articles(date, category, title, summary, url, source, image_url, audio_path)
```

JSON 和 SQLite 写同一批条目，双写保持一致。

## 本地预览

```bash
cd news_reports
npm install
npm run dev      # http://localhost:3000
npm run build    # 静态导出，产物在 out/
```

骨架阶段 `npm run build` 会读取 `data/2026-11-04.json` 做静态导出。
切换主题、分类筛选、顺序播报（含浏览器朗读兜底）均可在本地验证。

## 生成流程（骨架脚本，不含任何密钥）

```bash
python3 -m pip install -r scripts/requirements.txt
python3 scripts/generate_daily.py --date 2026-11-04 --sample
# 正式方向（需先确认源列表与密钥存放方式，见下）：
python3 scripts/generate_daily.py --date YYYY-MM-DD
```

脚本行为：RSS（feedparser）→ 可选 GNews（仅当环境变量 `GNEWS_API_KEY`
存在时才请求）→ 按标题+链接去重 → 关键词分类 → 摘要占位 →
写入 `data/<日期>.json` + SQLite。摘要占位函数会明确标注
“摘要占位，正式版由 AI 摘要替换”，正式版再替换为模型调用，
密钥一律从环境变量 / 密钥存储读取，**绝不写进代码和仓库**。

## 每日流程（正式版目标，非骨架现状）

1. 约 07:00（北京时间）：由 Muse 定时任务生成当日内容——抓取、去重、
   分类、AI 摘要、Edge-TTS 音频、AI 封面，写入当日 JSON + SQLite，
   并提交到远端 GitHub 仓库。
2. GitHub Pages 发布更新后的静态页面。
3. 07:30：向**定制新闻的侧边聊天**推送当日提醒（附页面链接与头条摘要）。
4. 同步写 Obsidian 摘要文件（见下一节）。任一步失败都不应静默丢弃，
   见失败处理。

> 骨架现状：未创建任何 GitHub 仓库、未设置任何定时任务、未写 Obsidian、
> 未调用任何外部 API。本仓库目前只在本地可运行、可预览。

## Obsidian 输出规格（正式版）

- **不写进每日日记。** 另开一个文件夹：`My Workspace/10-每日新闻/`
- 每天一个文件：`My Workspace/10-每日新闻/YYYY-MM-DD.md`，只写当日新闻播报摘要。
- 建议的文件内容模板：

```markdown
# 每日新闻播报 YYYY-MM-DD

> 页面链接：<当日 GitHub Pages 链接>
> 音频：整期播报 / 各条单独音频（见页面）

## 今日头条
- 标题 — 一句话摘要 — [原文链接](url)

## 政治 / 军事 / 时事 / 科研 / 大模型 / 人工智能
- 标题 — 一句话摘要 — [原文链接](url)

## 今日值得一试
- 项目/文章标题 — 一句话推荐理由 — [原文链接](url)
```

- 写入方式：增量追加当日文件，不覆盖日记、不改动待办与复盘内容。
- 失败处理：如果当时连不上 Obsidian（例如隧道授权过期、本地 Obsidian 未运行），
  当天晚些时候重试，或第二天补写；同时**在聊天框汇报问题**，
  页面更新与 07:30 聊天提醒不受 Obsidian 失败影响。

## 上线状态（2026-11-04）

- 公开仓库已由用户手动创建：`lcq666666/news_reports`（main 分支，初始为空仓库）。
- 本次推送包含 Next.js 骨架 + GitHub Pages 工作流（`.github/workflows/pages.yml`），
  推送后 Actions 会自动构建并发布到 `https://lcq666666.github.io/news_reports/`。
  首次发布需要在仓库 Settings → Pages 里确认 Source 为 GitHub Actions。
- 注意：SQLite 文件 `data/news.db` 是二进制文件，不走本连接器的文本快照推送，
  首版推送只含 JSON 数据；SQLite 的同步方式见“存储”一节，正式版再单独处理。

## 上线前还缺什么

1. **GitHub Pages 确认**：首次发布后在 Settings → Pages 确认 Source 为 GitHub Actions，
   并打开 `https://lcq666666.github.io/news_reports/` 验证。
2. **定时任务建立**：07:00 生成任务与 07:30 聊天提醒任务（骨架未建立任何 cron）。
4. **密钥存放方式确认**：GNews key、摘要模型 key、Product Hunt token
   （如需稳定取 Product Hunt 数据，用户需确认如何设置 token；
   在此之前不要把任何 token 发在聊天里或写进仓库）。
   建议走 GitHub Secrets / 安全存储，脚本只从环境变量读取。
5. **源列表最终确认**：RSSHub 路由、官方 RSS、GNews 分类、
   GitHub Trending / HelloGitHub / LINUX DO / V2EX 的筛选规则
   （HelloGitHub 为月刊，正式版按“本月精选轮换”处理，见骨架注释）。
6. **AI 封面与 Edge-TTS 的正式生成路径**：由 Muse 定时任务生成时
   可直接调用生图与 TTS；若改走 GitHub Actions 生成，则封面需改用
   外部生图 API——此分支在正式搭建前须二选一确认（骨架已按 Muse 生成分支留口子）。

## 安全与版权提醒

- 本仓库不含任何密钥、token、密码或真实用户数据。
- 正式版只展示标题、摘要与原文链接，不全文搬运新闻正文；
  图片优先用原文配图并保留来源，AI 图须标注。
