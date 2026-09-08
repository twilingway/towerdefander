/**
 * Where a frame actually goes, sampled from the engine rather than guessed.
 *
 * The panel's meters answer "how much" for the pieces that agreed to be timed:
 * our scene step, the snapshot conversion, React's commits. The judder that is
 * left is by definition in what none of them cover, so this asks V8 directly -
 * a sampling profile over a live fight, aggregated by function, self time
 * first.
 *
 * Self time, not total: a parent that spends its life waiting on children is
 * not the thing to fix, and total time would put `requestAnimationFrame` at the
 * top of every profile ever taken.
 *
 * Usage (the stand has to be up):
 *   node scripts/profile-display.mjs --cpu=4 --seconds=10
 */

import { chromium } from "@playwright/test";

import { flyForMs } from "./fly-the-ship.mjs";

const cpuThrottle = Number(
  process.argv.find((argument) => argument.startsWith("--cpu="))?.slice(6) ?? 1
);
const seconds = Number(
  process.argv.find((argument) => argument.startsWith("--seconds="))?.slice(10) ?? 10
);
const url = process.env.BENCH_URL ?? "http://127.0.0.1:5193/";
/** Which wave to open on, when the server was started with ALLOW_START_WAVE. */
const startWave = Number(
  process.argv.find((argument) => argument.startsWith("--wave="))?.slice(7) ?? 0
);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const browser = await chromium.launch({ channel: "chrome", headless: false });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(url, { waitUntil: "load" });

await page.getByRole("button", { name: "1 игрок" }).click();
await page.getByText("Играть с этого же устройства").click();
if (startWave > 1) {
  const field = page.getByLabel("Начать с волны (для тестов)");
  if ((await field.count()) === 0) {
    throw new Error("the server was not started with ALLOW_START_WAVE=true");
  }
  await field.fill(String(startWave));
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
// Let the fight settle: the first seconds are texture baking and the join, and
// profiling them would describe the loading screen.
await sleep(6_000);

const session = await page.context().newCDPSession(page);
if (cpuThrottle > 1) {
  await session.send("Emulation.setCPUThrottlingRate", { rate: cpuThrottle });
}

await session.send("Profiler.enable");
// A hundred microseconds: fine enough that a two-millisecond function lands in
// twenty samples rather than one, coarse enough not to be the load itself.
await session.send("Profiler.setSamplingInterval", { interval: 100 });
/*
 * Flown, not parked: a still ship measures a still picture. See
 * `scripts/fly-the-ship.mjs`, which both harnesses share so their numbers
 * describe the same fight.
 */
const flying = flyForMs(page, seconds * 1000);

await session.send("Profiler.start");
await flying;
const { profile } = await session.send("Profiler.stop");

const byNode = new Map(profile.nodes.map((node) => [node.id, node]));
const selfSamples = new Map();
for (const id of profile.samples) {
  selfSamples.set(id, (selfSamples.get(id) ?? 0) + 1);
}

const totalSamples = profile.samples.length;
const elapsedMs = (profile.endTime - profile.startTime) / 1000;
const rows = [];
for (const [id, count] of selfSamples) {
  const node = byNode.get(id);
  if (node === undefined) continue;
  const frame = node.callFrame;
  const where =
    frame.url === "" ? "" : ` ${frame.url.split("/").slice(-1)[0]}:${String(frame.lineNumber + 1)}`;
  rows.push({
    name: `${frame.functionName === "" ? "(анонимная)" : frame.functionName}${where}`,
    share: count / totalSamples,
    ms: (count / totalSamples) * elapsedMs
  });
}
rows.sort((left, right) => right.share - left.share);

console.log("");
console.log(`профиль: ${url}`);
console.log(
  `${seconds} с, ${String(totalSamples)} проб` +
    (cpuThrottle > 1 ? `, процессор замедлен в ${cpuThrottle} раз` : "")
);
console.log("");
console.log("доля | мс/с | функция");
console.log("-----|------|--------");
for (const row of rows.slice(0, 28)) {
  const perSecond = row.ms / (elapsedMs / 1000);
  console.log(
    `${(row.share * 100).toFixed(1).padStart(4)}% | ${perSecond.toFixed(1).padStart(4)} | ${row.name}`
  );
}

await browser.close();
