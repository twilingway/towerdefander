// Assembles the day folders into one readable history.
//
// Takes what the evidence and the capture left in artifacts/project-history:
// the facts of each day, the frames of each day's own build and the prose
// written beside them, and produces three things - a Markdown history, a
// manifest for the local dashboard, and a single self-contained HTML page.
//
// The page carries its frames inside itself as data URIs, because a published
// artifact may not reach out for an image. That is also why the frames are
// re-encoded first: the PNGs are worth about eight megabytes a day.
//
// Usage: node scripts/project-history-build.mjs [--max-mb 13]
import { execFile } from "node:child_process";
import { access, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const historyRoot = resolve(root, "artifacts", "project-history");
/** The frame that opens a day, in order of preference. */
const HERO = ["combat", "lobby", "admin"];
/** Encoding ladders, tried widest first until the page fits its ceiling. */
const PROFILES = [
  { hero: 1200, thumb: 720, quality: 5 },
  { hero: 1000, thumb: 600, quality: 6 },
  { hero: 820, thumb: 480, quality: 7 }
];
const MONTHS = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря"
];

const maxBytes = readMaxBytes(process.argv.slice(2));
const eras = JSON.parse(await readFile(join(historyRoot, "eras.json"), "utf8"));
const days = await readDays();
if (days.length === 0) throw new Error("No days collected yet.");

await writeFile(join(historyRoot, "HISTORY.md"), renderMarkdown(eras, days), "utf8");
await writeFile(
  join(historyRoot, "index.json"),
  // No build timestamp: a rebuild that changed nothing should leave the tree clean.
  `${JSON.stringify({ eras, days: days.map(summarise) }, undefined, 2)}\n`,
  "utf8"
);

let page;
for (const [index, profile] of PROFILES.entries()) {
  await encodeFrames(days, profile);
  page = renderPage(eras, days, await loadImages(days));
  const size = Buffer.byteLength(page, "utf8");
  console.log(`profile ${String(index + 1)}: ${(size / 1024 / 1024).toFixed(1)} MB`);
  if (size <= maxBytes) break;
}
await writeFile(join(historyRoot, "index.html"), page, "utf8");
console.log(`History page: ${relative(root, join(historyRoot, "index.html"))}`);

function readMaxBytes(values) {
  const flag = values.indexOf("--max-mb");
  const megabytes = flag === -1 ? 13 : Number(values[flag + 1]);
  if (!Number.isFinite(megabytes) || megabytes <= 0) throw new Error("--max-mb must be a number.");
  return megabytes * 1024 * 1024;
}

async function readDays() {
  const entries = await readdir(historyRoot, { withFileTypes: true });
  const collected = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^\d{4}-\d{2}-\d{2}$/u.test(entry.name)) continue;
    const directory = join(historyRoot, entry.name);
    const evidence = await readJson(join(directory, "evidence.json"));
    if (evidence === undefined) continue;
    const capture = await readJson(join(directory, "capture.json"));
    const report = await readOptional(join(directory, "report.md"));
    collected.push({
      date: entry.name,
      directory,
      evidence,
      capture,
      ...splitReport(report, entry.name)
    });
  }
  return collected.sort((left, right) => left.date.localeCompare(right.date));
}

/** The report's heading is the day's title; everything under it is the story. */
function splitReport(report, date) {
  if (report === undefined) return { title: humanDate(date), paragraphs: [] };
  const lines = report.trim().split(/\r?\n/u);
  const heading = lines[0].startsWith("# ") ? lines[0].slice(2).trim() : humanDate(date);
  const body = (lines[0].startsWith("# ") ? lines.slice(1) : lines).join("\n").trim();
  const paragraphs = body
    .split(/\n\s*\n/u)
    .map((block) => block.replace(/\s*\n\s*/gu, " ").trim())
    .filter(Boolean);
  return { title: heading, paragraphs };
}

async function encodeFrames(collected, profile) {
  for (const day of collected) {
    const web = join(day.directory, "web");
    await mkdir(web, { recursive: true });
    for (const shot of pictures(day)) {
      const source = join(day.directory, "captures", shot.file);
      if (!(await exists(source))) continue;
      const width = shot.id === heroId(day) ? profile.hero : profile.thumb;
      const target = join(web, `${shot.id}.jpg`);
      await run("ffmpeg", [
        "-y",
        "-loglevel",
        "error",
        "-i",
        source,
        "-vf",
        `scale=${String(width)}:-2:flags=lanczos`,
        "-q:v",
        String(profile.quality),
        target
      ]);
    }
  }
}

async function loadImages(collected) {
  const images = new Map();
  for (const day of collected) {
    for (const shot of pictures(day)) {
      const file = join(day.directory, "web", `${shot.id}.jpg`);
      if (!(await exists(file))) continue;
      const data = await readFile(file);
      images.set(`${day.date}/${shot.id}`, `data:image/jpeg;base64,${data.toString("base64")}`);
    }
  }
  return images;
}

/** Everything but the recording: a page carries stills. */
function pictures(day) {
  return (day.capture?.shots ?? []).filter((shot) => shot.file.endsWith(".png"));
}

function heroId(day) {
  const available = new Set(pictures(day).map((shot) => shot.id));
  return HERO.find((id) => available.has(id)) ?? pictures(day).at(0)?.id;
}

function summarise(day) {
  return {
    date: day.date,
    title: day.title,
    revision: day.evidence.revision,
    commits: day.evidence.commits.length,
    shots: (day.capture?.shots ?? []).map((shot) => ({ ...shot })),
    notes: day.capture?.status ?? []
  };
}

function renderMarkdown(grouped, collected) {
  const lines = [
    "# История SpaceShip Defender",
    "",
    `С ${humanDate(collected.at(0).date)} по ${humanDate(collected.at(-1).date)}: ${String(collected.length)} ${pluralDays(collected.length)} с коммитами, ${String(totalCommits(collected))} коммитов, две смены жанра.`,
    "",
    "Кадры каждого дня сняты запуском ревизии этого дня сегодня — это воспроизведение, а не запись, сделанная тогда.",
    ""
  ];
  for (const era of grouped) {
    const inEra = collected.filter((day) => day.date >= era.from && day.date <= era.to);
    if (inEra.length === 0) continue;
    lines.push(`## ${era.title}`, "", `_${humanRange(era)}_`, "", era.summary, "");
    for (const day of inEra) {
      lines.push(`### ${humanDate(day.date)} — ${day.title}`, "");
      lines.push(`_${factLine(day)}_`, "");
      for (const paragraph of day.paragraphs) lines.push(paragraph, "");
      const shots = (day.capture?.shots ?? []).map((shot) => shot.title).join(", ");
      if (shots.length > 0) lines.push(`Кадры: ${shots}.`, "");
    }
  }
  return `${lines.join("\n")}\n`;
}

function factLine(day) {
  const parts = [`${String(day.evidence.commits.length)} ${plural(day.evidence.commits.length)}`];
  const changed = day.evidence.commits.reduce(
    (sum, commit) => sum + commit.insertions + commit.deletions,
    0
  );
  parts.push(`${formatNumber(changed)} строк тронуто`);
  for (const contract of day.evidence.contracts) {
    if (contract.name === "PROTOCOL_VERSION") {
      parts.push(`протокол ${String(contract.before ?? "—")} → ${String(contract.after ?? "—")}`);
    }
    if (contract.name === "BALANCE_FILE_VERSION") {
      parts.push(`баланс ${String(contract.before ?? "—")} → ${String(contract.after ?? "—")}`);
    }
  }
  for (const name of day.evidence.workspaces.added) parts.push(`появилось ${name}`);
  return parts.join(" · ");
}

function totalCommits(collected) {
  return collected.reduce((sum, day) => sum + day.evidence.commits.length, 0);
}

function plural(count) {
  const tens = count % 100;
  const ones = count % 10;
  if (tens > 10 && tens < 20) return "коммитов";
  if (ones === 1) return "коммит";
  if (ones >= 2 && ones <= 4) return "коммита";
  return "коммитов";
}

function pluralDays(count) {
  const tens = count % 100;
  const ones = count % 10;
  if (tens > 10 && tens < 20) return "дней";
  if (ones === 1) return "день";
  if (ones >= 2 && ones <= 4) return "дня";
  return "дней";
}

function formatNumber(value) {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/gu, " ");
}

function humanDate(date) {
  const [year, month, day] = date.split("-").map(Number);
  return `${String(day)} ${MONTHS[month - 1]} ${String(year)}`;
}

function shortDate(date) {
  const [, month, day] = date.split("-").map(Number);
  return `${String(day)} ${MONTHS[month - 1]}`;
}

function humanRange(era) {
  return `${shortDate(era.from)} — ${shortDate(era.to)}`;
}

function escape(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderPage(grouped, collected, images) {
  const sections = grouped
    .map((era) => renderEra(era, collected, images))
    .filter(Boolean)
    .join("\n");
  return `${pageHead()}
<header class="masthead">
  <p class="eyebrow">Дневник разработки</p>
  <h1>Хроника SpaceShip Defender</h1>
  <p class="dek">Кооперативная игра для телевизора и телефонов: от башенной обороны до космического
  боя на троих. Каждый день здесь — отдельная версия, снятая её собственным запуском.</p>
  <dl class="counters">
    <div><dt>дней с работой</dt><dd>${String(collected.length)}</dd></div>
    <div><dt>коммитов</dt><dd>${String(totalCommits(collected))}</dd></div>
    <div><dt>смен жанра</dt><dd>2</dd></div>
    <div><dt>версий протокола</dt><dd>4 → 47</dd></div>
  </dl>
  <p class="caveat">Кадры сняты сегодня запуском ревизии соответствующего дня в отдельной копии
  репозитория. Это воспроизведение той версии, а не запись, сделанная в тот день.</p>
</header>
<nav class="eras" aria-label="Эпохи">
${grouped.map((era) => `  <a href="#era-${era.id}"><b>${escape(era.title)}</b><span>${escape(humanRange(era))}</span></a>`).join("\n")}
</nav>
<main>
${sections}
</main>
<footer class="colophon">
  <p>Собрано из истории репозитория: факты каждого дня — из его коммитов, тел сообщений и
  затронутых спецификаций; кадры — из detached-копии на последней ревизии дня, поднятой со своим
  сервером и своими приложениями.</p>
  <p class="tools"><code>project-history-evidence.mjs</code> · <code>project-history-capture.mjs</code>
  · <code>project-history-build.mjs</code></p>
</footer>
<div class="viewer" id="viewer" hidden>
  <button type="button" class="viewer-close" id="viewer-close" aria-label="Закрыть">×</button>
  <img id="viewer-image" alt="" />
  <p id="viewer-caption"></p>
</div>
<script>
  const viewer = document.querySelector("#viewer");
  const viewerImage = document.querySelector("#viewer-image");
  const viewerCaption = document.querySelector("#viewer-caption");
  function closeViewer() {
    viewer.hidden = true;
    viewerImage.removeAttribute("src");
  }
  document.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-full]");
    if (trigger !== null) {
      viewerImage.src = trigger.getAttribute("data-full");
      viewerCaption.textContent = trigger.getAttribute("data-caption") ?? "";
      viewer.hidden = false;
      return;
    }
    if (event.target.closest("#viewer") !== null) closeViewer();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeViewer();
  });
</script>
`;
}

function renderEra(era, collected, images) {
  const inEra = collected.filter((day) => day.date >= era.from && day.date <= era.to);
  if (inEra.length === 0) return "";
  return `<section class="era" id="era-${era.id}">
  <div class="era-head">
    <p class="era-range">${escape(humanRange(era))}</p>
    <h2>${escape(era.title)}</h2>
    <p class="era-summary">${escape(era.summary)}</p>
  </div>
${inEra.map((day) => renderDay(day, images)).join("\n")}
</section>`;
}

function renderDay(day, images) {
  const hero = heroId(day);
  const shots = pictures(day);
  const heroShot = shots.find((shot) => shot.id === hero);
  const rest = shots.filter((shot) => shot.id !== hero);
  const heroSource = images.get(`${day.date}/${hero}`);
  return `  <article class="day" id="day-${day.date}">
    <div class="day-head">
      <p class="day-date">${escape(shortDate(day.date))}</p>
      <h3>${escape(day.title)}</h3>
      <p class="day-facts">${escape(factLine(day))}</p>
    </div>
${
  heroSource === undefined
    ? ""
    : `    <figure class="hero">
      <img src="${heroSource}" alt="${escape(heroShot?.title ?? "")}" data-full="${heroSource}" data-caption="${escape(heroShot?.title ?? "")}" loading="lazy" />
      <figcaption>${escape(heroShot?.title ?? "")} · ревизия ${escape((day.evidence.revision ?? "").slice(0, 7))}</figcaption>
    </figure>`
}
    <div class="prose">
${day.paragraphs.map((paragraph) => `      <p>${escape(paragraph)}</p>`).join("\n")}
    </div>
${
  rest.length === 0
    ? ""
    : `    <div class="strip">
${rest
  .map((shot) => {
    const source = images.get(`${day.date}/${shot.id}`);
    if (source === undefined) return "";
    return `      <figure><img src="${source}" alt="${escape(shot.title)}" data-full="${source}" data-caption="${escape(shot.title)}" loading="lazy" /><figcaption>${escape(shot.title)}</figcaption></figure>`;
  })
  .filter(Boolean)
  .join("\n")}
    </div>`
}
  </article>`;
}

async function readJson(path) {
  const text = await readOptional(path);
  return text === undefined ? undefined : JSON.parse(text);
}

async function readOptional(path) {
  try {
    return await readFile(path, "utf8");
  } catch {
    return undefined;
  }
}

async function exists(path) {
  try {
    await access(path);
    return (await stat(path)).size > 0;
  } catch {
    return false;
  }
}

function pageHead() {
  return `<title>Хроника SpaceShip Defender</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;600&family=Literata:opsz,wght@7..72,400;7..72,600&family=IBM+Plex+Mono:wght@400;500&display=swap"
  rel="stylesheet"
/>
<style>
  :root {
    --ground: #f3f5f2;
    --panel: #ffffff;
    --panel-edge: #d9e0da;
    --ink: #16211d;
    --ink-soft: #4e5d56;
    --ink-faint: #7d8b84;
    --gold: #a8741a;
    --signal: #1f7d55;
    --band: #10211d;
    --band-ink: #e8efe9;
    --band-faint: #8fa79c;
    --measure: 66ch;
    --step-0: 1.0625rem;
    --step-1: 1.35rem;
    --step-2: 1.85rem;
    --step-3: 2.6rem;
    --step-4: 3.4rem;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --ground: #0b1512;
      --panel: #111d19;
      --panel-edge: #22332c;
      --ink: #e6ede8;
      --ink-soft: #a8b8b0;
      --ink-faint: #7a8b83;
      --gold: #d9a13f;
      --signal: #4fc08d;
      --band: #08110f;
      --band-ink: #e8efe9;
      --band-faint: #7e968c;
    }
  }
  :root[data-theme="dark"] {
    --ground: #0b1512;
    --panel: #111d19;
    --panel-edge: #22332c;
    --ink: #e6ede8;
    --ink-soft: #a8b8b0;
    --ink-faint: #7a8b83;
    --gold: #d9a13f;
    --signal: #4fc08d;
    --band: #08110f;
    --band-ink: #e8efe9;
    --band-faint: #7e968c;
  }
  * {
    box-sizing: border-box;
  }
  body {
    margin: 0;
    background: var(--ground);
    color: var(--ink);
    font-family: "Literata", Georgia, "Times New Roman", serif;
    font-size: var(--step-0);
    line-height: 1.62;
    -webkit-text-size-adjust: 100%;
  }
  h1,
  h2,
  h3,
  .eyebrow,
  .era-range,
  .day-date,
  .counters dt {
    font-family: "Oswald", "PT Sans Narrow", "Arial Narrow", sans-serif;
    font-weight: 600;
    text-wrap: balance;
  }
  code,
  .day-facts,
  .counters dd,
  figcaption,
  .tools {
    font-family: "IBM Plex Mono", ui-monospace, "Cascadia Mono", monospace;
  }
  .masthead,
  .eras,
  main,
  .colophon {
    max-width: 78rem;
    margin: 0 auto;
    padding-inline: clamp(1rem, 4vw, 3rem);
  }
  .masthead {
    padding-block: clamp(3rem, 8vw, 6rem) 2rem;
  }
  .eyebrow {
    margin: 0 0 0.6rem;
    letter-spacing: 0.24em;
    text-transform: uppercase;
    font-size: 0.78rem;
    color: var(--gold);
  }
  h1 {
    margin: 0;
    font-size: var(--step-4);
    line-height: 1.02;
    letter-spacing: -0.01em;
  }
  .dek {
    max-width: var(--measure);
    margin: 1.1rem 0 0;
    font-size: var(--step-1);
    color: var(--ink-soft);
  }
  .counters {
    display: flex;
    flex-wrap: wrap;
    gap: 1.6rem 3rem;
    margin: 2.4rem 0 0;
    padding: 1.4rem 0 0;
    border-top: 1px solid var(--panel-edge);
  }
  .counters div {
    display: flex;
    flex-direction: column-reverse;
    gap: 0.15rem;
  }
  .counters dt {
    margin: 0;
    font-size: 0.74rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--ink-faint);
  }
  .counters dd {
    margin: 0;
    font-size: var(--step-2);
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    color: var(--ink);
  }
  .caveat {
    max-width: var(--measure);
    margin: 1.8rem 0 0;
    padding-left: 0.9rem;
    border-left: 2px solid var(--gold);
    font-size: 0.95rem;
    color: var(--ink-soft);
  }
  .eras {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
    gap: 0.6rem;
    padding-block: 1.4rem 2.6rem;
  }
  .eras a {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    padding: 0.7rem 0.85rem;
    border: 1px solid var(--panel-edge);
    background: var(--panel);
    color: var(--ink);
    text-decoration: none;
    font-family: "Oswald", "Arial Narrow", sans-serif;
  }
  .eras a b {
    font-weight: 600;
    font-size: 1.02rem;
  }
  .eras a span {
    font-family: "IBM Plex Mono", monospace;
    font-size: 0.76rem;
    color: var(--ink-faint);
  }
  .eras a:hover,
  .eras a:focus-visible {
    border-color: var(--gold);
    color: var(--gold);
  }
  .era {
    margin-bottom: 4rem;
  }
  .era-head {
    padding: 2rem clamp(1rem, 3vw, 2.4rem);
    background: var(--band);
    color: var(--band-ink);
  }
  .era-range {
    margin: 0 0 0.4rem;
    font-size: 0.8rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--gold);
  }
  .era-head h2 {
    margin: 0;
    font-size: var(--step-3);
    line-height: 1.05;
  }
  .era-summary {
    max-width: var(--measure);
    margin: 0.9rem 0 0;
    color: var(--band-faint);
  }
  .day {
    display: grid;
    gap: 1.2rem;
    padding: 2.4rem 0 2.8rem;
    border-bottom: 1px solid var(--panel-edge);
  }
  .day-head {
    display: grid;
    gap: 0.35rem;
  }
  .day-date {
    margin: 0;
    font-size: 0.82rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--signal);
  }
  .day-head h3 {
    margin: 0;
    max-width: 34ch;
    font-size: var(--step-2);
    line-height: 1.12;
  }
  .day-facts {
    margin: 0;
    font-size: 0.82rem;
    color: var(--ink-faint);
    font-variant-numeric: tabular-nums;
  }
  figure {
    margin: 0;
  }
  .hero img,
  .strip img {
    display: block;
    width: 100%;
    max-width: 100%;
    height: auto;
    background: #0a1210;
    cursor: zoom-in;
  }
  .hero img {
    border: 1px solid var(--panel-edge);
  }
  figcaption {
    margin-top: 0.45rem;
    font-size: 0.76rem;
    color: var(--ink-faint);
  }
  .prose {
    max-width: var(--measure);
  }
  .prose p {
    margin: 0 0 1.05rem;
  }
  .prose p:last-child {
    margin-bottom: 0;
  }
  .strip {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
    gap: 0.9rem;
  }
  .strip img {
    border: 1px solid var(--panel-edge);
  }
  .colophon {
    padding-block: 3rem 4.5rem;
    color: var(--ink-soft);
  }
  .colophon p {
    max-width: var(--measure);
    margin: 0 0 0.8rem;
    font-size: 0.95rem;
  }
  .tools {
    font-size: 0.8rem;
    color: var(--ink-faint);
  }
  .viewer[hidden] {
    display: none;
  }
  .viewer {
    position: fixed;
    inset: 0;
    z-index: 10;
    display: grid;
    place-items: center;
    gap: 0.8rem;
    padding: clamp(1rem, 4vw, 3rem);
    background: rgb(6 12 10 / 92%);
    cursor: zoom-out;
  }
  .viewer img {
    max-width: 100%;
    max-height: 82vh;
    object-fit: contain;
  }
  .viewer p {
    margin: 0;
    font-family: "IBM Plex Mono", monospace;
    font-size: 0.8rem;
    color: #9fb3aa;
  }
  .viewer-close {
    position: absolute;
    top: 1rem;
    right: 1.2rem;
    padding: 0.1rem 0.6rem;
    border: 1px solid #3c534a;
    border-radius: 2px;
    background: transparent;
    color: #cfdcd6;
    font-size: 1.6rem;
    line-height: 1.2;
    cursor: pointer;
  }
  a:focus-visible,
  button:focus-visible,
  img:focus-visible {
    outline: 2px solid var(--gold);
    outline-offset: 2px;
  }
  @media (max-width: 40rem) {
    :root {
      --step-4: 2.35rem;
      --step-3: 1.85rem;
      --step-2: 1.4rem;
    }
    .counters {
      gap: 1.1rem 2rem;
    }
  }
</style>
`;
}
