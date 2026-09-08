/**
 * What is inside the frames that ran long, as opposed to what the average is.
 *
 * The reference prototype drops to fifty frames a second under a crowd and
 * still reads as smooth, while ours reads as torn at a higher average - so the
 * thing to find is not total work but its shape. A profile by self time cannot
 * answer that: it says where the milliseconds went across the whole run, and a
 * spike that happens on one frame in twenty is a rounding error in that sum
 * while being the entire complaint.
 *
 * So this records a trace, measures every frame between consecutive
 * `RunTask`-level commits, takes the ones that ran long, and reports what those
 * frames contained that the short ones did not.
 *
 * Usage (the stand has to be up, and a fight running):
 *   node scripts/trace-long-frames.mjs --cpu=6 --seconds=12 --wave=8
 */

import { chromium } from "@playwright/test";

import { flyForMs } from "./fly-the-ship.mjs";

const cpuThrottle = Number(
  process.argv.find((argument) => argument.startsWith("--cpu="))?.slice(6) ?? 1
);
const seconds = Number(
  process.argv.find((argument) => argument.startsWith("--seconds="))?.slice(10) ?? 12
);
const startWave = Number(
  process.argv.find((argument) => argument.startsWith("--wave="))?.slice(7) ?? 0
);
const url = process.env.BENCH_URL ?? "http://127.0.0.1:5193/";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const browser = await chromium.launch({ channel: "chrome", headless: false });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(url, { waitUntil: "load" });
await page.getByRole("button", { name: "1 игрок" }).click();
await page.getByText("Играть с этого же устройства").click();
if (startWave > 1) {
  await page.getByLabel("Начать с волны (для тестов)").fill(String(startWave));
}
await page.getByRole("button", { name: "Создать комнату" }).click();
const ready = page.getByTestId("cockpit-ready");
await ready.waitFor({ timeout: 60_000 });
for (let attempt = 0; attempt < 120; attempt++) {
  if ((await ready.getAttribute("data-world-ready")) === "true") break;
  await sleep(500);
}
await ready.click();
await page.waitForSelector('[data-testid="spaceship-world"]', { timeout: 60_000 });
await sleep(5_000);

const session = await page.context().newCDPSession(page);
if (cpuThrottle > 1) {
  await session.send("Emulation.setCPUThrottlingRate", { rate: cpuThrottle });
}

const events = [];
session.on("Tracing.dataCollected", ({ value }) => events.push(...value));

await session.send("Tracing.start", {
  categories: "devtools.timeline,disabled-by-default-devtools.timeline",
  transferMode: "ReportEvents"
});
const flying = flyForMs(page, seconds * 1000);
await sleep(seconds * 1000);
await flying;
const finished = new Promise((resolve) => session.once("Tracing.tracingComplete", resolve));
await session.send("Tracing.end");
await finished;

/*
 * Frames are taken from `AnimationFrame` fired events rather than from the
 * renderer's own frame markers: this is the clock the game actually draws on,
 * and the gap between two of them is what a player calls a frame.
 */
const raf = events
  .filter((event) => event.name === "FireAnimationFrame" && event.ph === "X")
  .sort((left, right) => left.ts - right.ts);

const gaps = [];
for (let index = 1; index < raf.length; index++) {
  gaps.push({
    from: raf[index - 1].ts,
    to: raf[index].ts,
    ms: (raf[index].ts - raf[index - 1].ts) / 1000
  });
}
if (gaps.length < 20) {
  console.log("слишком мало кадров в трассе — нечего сравнивать");
  await browser.close();
  process.exit(0);
}

const sorted = [...gaps].map((gap) => gap.ms).sort((a, b) => a - b);
const median = sorted[sorted.length >> 1];
const longFrames = gaps.filter((gap) => gap.ms > median * 1.5);

/** Everything that ran inside a window, by name, with its own duration summed. */
function inside(from, to) {
  const totals = new Map();
  for (const event of events) {
    if (event.ph !== "X" || typeof event.dur !== "number") continue;
    if (event.ts < from || event.ts > to) continue;
    totals.set(event.name, (totals.get(event.name) ?? 0) + event.dur / 1000);
  }
  return totals;
}

const longTotals = new Map();
for (const frame of longFrames) {
  for (const [name, ms] of inside(frame.from, frame.to)) {
    longTotals.set(name, (longTotals.get(name) ?? 0) + ms);
  }
}
const shortFrames = gaps.filter((gap) => gap.ms <= median * 1.5);
const shortTotals = new Map();
for (const frame of shortFrames) {
  for (const [name, ms] of inside(frame.from, frame.to)) {
    shortTotals.set(name, (shortTotals.get(name) ?? 0) + ms);
  }
}

const perLong = (name) => (longTotals.get(name) ?? 0) / Math.max(1, longFrames.length);
const perShort = (name) => (shortTotals.get(name) ?? 0) / Math.max(1, shortFrames.length);
const names = new Set([...longTotals.keys(), ...shortTotals.keys()]);
const rows = [...names]
  .map((name) => ({ name, long: perLong(name), short: perShort(name) }))
  .filter((row) => row.long > 0.05)
  .sort((left, right) => right.long - right.short - (left.long - left.short));

console.log("");
console.log(`трасса: ${url}${cpuThrottle > 1 ? `, процессор замедлен в ${cpuThrottle} раз` : ""}`);
console.log(
  `кадров ${String(gaps.length)}, медиана ${median.toFixed(1)} мс, длинных ` +
    `${String(longFrames.length)} (${((longFrames.length / gaps.length) * 100).toFixed(0)}%), ` +
    `худший ${Math.max(...gaps.map((gap) => gap.ms)).toFixed(0)} мс`
);
console.log("");
console.log("в длинном | в обычном | разница | событие");
console.log("----------|-----------|---------|--------");
for (const row of rows.slice(0, 18)) {
  console.log(
    `${row.long.toFixed(2).padStart(9)} | ${row.short.toFixed(2).padStart(9)} | ` +
      `${(row.long - row.short).toFixed(2).padStart(7)} | ${row.name}`
  );
}

await browser.close();
