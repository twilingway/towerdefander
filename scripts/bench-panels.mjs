/**
 * What each panel costs, measured in a real browser, on both stands.
 *
 * The reference prototype answers this question with `scripts/bench-radar.mjs`:
 * drive the page, hold everything else still, flip one switch, and read the
 * instruments over whole seconds. This is the same method pointed at both
 * stands, so the two tables are comparable rather than merely adjacent.
 *
 * Method, and why each part is there:
 *
 *   - one variable per run. Only the interface switch moves; the world, the
 *     camera and the connection stay as they are.
 *   - a warm-up after every switch. Every meter on both sides reports over a
 *     one-second window, so the samples right after a toggle describe the
 *     toggle.
 *   - medians over many samples. A mean is dragged around by the single GC
 *     pause this is trying to observe rather than average away.
 *   - the frame counter is the verdict. A panel's own render time says what
 *     React admits to; the style, layout and paint it then forces are not in
 *     that number and are in this one.
 *
 * Usage (the stand has to be up already):
 *   node scripts/bench-panels.mjs            # this game, ?diag=1
 *   node scripts/bench-panels.mjs --lab      # the reference prototype
 */

// `@playwright/test` rather than `playwright`: it is the browser driver this
// repository already depends on, and pulling in a second copy to save one word
// in an import would be a second browser download.
import { chromium } from "@playwright/test";

const useLab = process.argv.includes("--lab");
/*
 * The verdict without the instrument in the way.
 *
 * The panel that reports these numbers is itself a React subtree committing
 * twice a second, and it turned out to be more than half of the React the panel
 * was reporting. So the honest reading of a normal game is taken with the panel
 * closed, off the small readout in the header, which says the same three things
 * and costs a row of text.
 */
const plain = process.argv.includes("--plain");
/*
 * Which of the scene's own switches to hold off for the whole run.
 *
 * Attribution, not tuning: with React off the patch path the judder that is
 * left has to be either the drawing or the garbage, and turning one layer off
 * at a time is the only way to say which without guessing. `--off=фон,свечение`
 * names them the way the panel does.
 */
const switchesOff = (process.argv.find((argument) => argument.startsWith("--off="))?.slice(6) ?? "")
  .split(",")
  .map((name) => name.trim())
  .filter((name) => name.length > 0);

const SWITCHES = {
  фон: { testId: "diagnostics-background-toggle", attribute: "data-background" },
  свечение: { testId: "diagnostics-glow-toggle", attribute: "data-glow" },
  векторы: { testId: "diagnostics-vectors-toggle", attribute: "data-vectors" },
  предсказание: { testId: "diagnostics-prediction-toggle", attribute: "data-prediction" }
};
/*
 * A desktop at 165 fps has three times the headroom a phone does, and both
 * stands measure as flawless on one. Throttling the main thread is how the
 * comparison is made on the machine that has the problem: the same divisor on
 * both sides, so what is left is the difference between the two pages rather
 * than between two devices.
 */
const cpuThrottle = Number(
  process.argv.find((argument) => argument.startsWith("--cpu="))?.slice(6) ?? 1
);
const WARMUP_MS = 4_000;
const SAMPLES = 12;
const SAMPLE_INTERVAL_MS = 1_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const median = (values) => {
  const clean = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (clean.length === 0) return NaN;
  const mid = clean.length >> 1;
  return clean.length % 2 ? clean[mid] : (clean[mid - 1] + clean[mid]) / 2;
};

const fixed = (v, digits = 1) => (Number.isFinite(v) ? v.toFixed(digits) : "—");

const browser = await chromium.launch({ channel: "chrome", headless: false });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(String(error)));

/*
 * Each stand exposes the same three things under different names: a place to
 * read numbers from, a way into a running fight, and a switch that takes the
 * interface off. Everything below this object is shared.
 */
const stand = useLab
  ? {
      name: "лаборатория",
      url: process.env.LAB_URL ?? "http://localhost:6173/",
      async enter() {
        await page.waitForSelector(".hud-readout", { timeout: 30_000 });
        await page.waitForFunction(
          () => (document.querySelector(".hud-readout")?.textContent ?? "").includes("fps"),
          null,
          { timeout: 30_000 }
        );
      },
      async setInterface(on) {
        const button = page.locator("button.hud-toggle", { hasText: "интерфейс:" });
        for (let attempt = 0; attempt < 4; attempt++) {
          if (((await button.textContent()) ?? "").includes(on ? "ВКЛ" : "ВЫКЛ")) return;
          await button.click();
          await sleep(150);
        }
        throw new Error("could not reach the interface mode");
      },
      read: () =>
        page.evaluate(() => {
          const text = document.querySelector(".hud-readout")?.textContent ?? "";
          const rows = {};
          for (const line of text.split("\n")) {
            const trimmed = line.trim();
            if (trimmed.length === 0) continue;
            const at = trimmed.indexOf(" ");
            if (at < 0) continue;
            rows[trimmed.slice(0, at).trim()] = trimmed.slice(at + 1).trim();
          }
          return rows;
        })
    }
  : {
      name: "spaceship defender",
      url:
        process.env.BENCH_URL ??
        (plain ? "http://127.0.0.1:5173/" : "http://127.0.0.1:5173/?diag=1"),
      async enter() {
        await page.getByRole("button", { name: "1 игрок" }).click();
        // Solo from this same device is the path under test: without the tick
        // the page opens a room and waits for a phone, and the cockpit - which
        // is the whole subject of the measurement - never mounts.
        await page.getByText("Играть с этого же устройства").click();
        await page.getByRole("button", { name: "Создать комнату" }).click();
        const ready = page.getByTestId("cockpit-ready");
        // The world gate: the button stays disabled until the textures are
        // baked, and clicking through it would measure a loading screen.
        await ready.waitFor({ timeout: 60_000 });
        for (let attempt = 0; attempt < 120; attempt++) {
          if ((await ready.getAttribute("data-world-ready")) === "true") break;
          await sleep(500);
        }
        await ready.click();
        await page.waitForSelector(
          plain ? '[data-testid="fps-readout"]' : '[data-testid="diagnostics-panel"]',
          { timeout: 60_000 }
        );
      },
      async setInterface(on) {
        if (plain) return;
        const button = page.getByTestId("diagnostics-interface-toggle");
        for (let attempt = 0; attempt < 4; attempt++) {
          if ((await button.getAttribute("data-interface")) === (on ? "on" : "off")) return;
          await button.click();
          await sleep(150);
        }
        throw new Error("could not reach the interface mode");
      },
      read: () =>
        page.evaluate((bare) => {
          const rows = {};
          if (bare) {
            const readout = document.querySelector('[data-testid="fps-readout"]');
            rows["Кадр"] = readout?.textContent?.trim() ?? "";
            return rows;
          }
          for (const pair of document.querySelectorAll('[data-testid="diagnostics-panel"] div')) {
            const term = pair.querySelector("dt");
            const value = pair.querySelector("dd");
            if (term && value) rows[term.textContent.trim()] = value.textContent.trim();
          }
          return rows;
        }, plain)
    };

await page.goto(stand.url, { waitUntil: "load" });
await stand.enter();

for (const name of switchesOff) {
  const control = SWITCHES[name];
  if (control === undefined) throw new Error(`unknown switch: ${name}`);
  const button = page.getByTestId(control.testId);
  for (let attempt = 0; attempt < 4; attempt++) {
    if ((await button.getAttribute(control.attribute)) === "off") break;
    await button.click();
    await sleep(150);
  }
}

if (cpuThrottle > 1) {
  // Applied after joining: a throttled page takes minutes to reach a fight, and
  // the loading is not what is being measured.
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setCPUThrottlingRate", { rate: cpuThrottle });
}

const runs = [];
for (const on of plain ? [true] : [true, false]) {
  await stand.setInterface(on);
  await sleep(WARMUP_MS);
  const samples = [];
  for (let i = 0; i < SAMPLES; i++) {
    await sleep(SAMPLE_INTERVAL_MS);
    samples.push(await stand.read());
  }
  runs.push({ label: on ? "интерфейс ВКЛ" : "интерфейс ВЫКЛ", samples });
}

/** Every number in a row, so a row's shape does not have to be known in advance. */
const numbersIn = (text) => (text.match(/-?\d+(?:[.,]\d+)?/g) ?? []).map(Number);

console.log("");
console.log(`стенд: ${stand.name} — ${stand.url}`);
console.log(
  `${SAMPLES} проб по секунде после ${WARMUP_MS / 1000} с прогрева, медианы` +
    (cpuThrottle > 1 ? ` · процессор замедлен в ${cpuThrottle} раз` : "") +
    (switchesOff.length > 0 ? ` · выключено: ${switchesOff.join(", ")}` : "")
);

for (const run of runs) {
  console.log("");
  console.log(`--- ${run.label} ---`);
  const keys = new Set();
  for (const sample of run.samples) for (const key of Object.keys(sample)) keys.add(key);
  for (const key of keys) {
    const texts = run.samples.map((sample) => sample[key] ?? "");
    const width = Math.max(...texts.map((t) => numbersIn(t).length));
    if (width === 0) {
      console.log(`${key.padEnd(22)} | ${texts[texts.length - 1]}`);
      continue;
    }
    const medians = [];
    for (let column = 0; column < width; column++) {
      medians.push(fixed(median(texts.map((t) => numbersIn(t)[column]))));
    }
    console.log(`${key.padEnd(22)} | ${medians.join(" · ")}`);
  }
}

if (pageErrors.length > 0) {
  console.log("");
  console.log("ошибки страницы:");
  for (const error of pageErrors.slice(0, 5)) console.log("  " + error);
}

await browser.close();
