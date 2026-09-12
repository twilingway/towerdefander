/**
 * Every screen this game has, at every size a screen comes in.
 *
 * Not screenshots: a sweep that asks measurable questions - does the page
 * scroll sideways, does anything stand outside the window, is the control the
 * screen exists for actually reachable where it is drawn - because "looks
 * wrong" is not something a script can answer and these are.
 *
 * Usage (the stand has to be up):
 *   node scripts/layout-sweep.mjs
 *   BENCH_URL=http://127.0.0.1:5173/ node scripts/layout-sweep.mjs
 *
 * Every size it walks is a real device shape, portrait and landscape, from a
 * 360-wide phone to a television. It found, in one pass: a mode tile sixty
 * pixels wider than its own grid column on a landscape phone, and the button
 * that starts a run sitting below the fold on everything from that phone to a
 * 1366 laptop.
 */
import { chromium } from "@playwright/test";

const url = process.env.BENCH_URL ?? "http://127.0.0.1:5173/";
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

const SIZES = [
  { label: "360x640  малый вдоль", width: 360, height: 640, mobile: true },
  { label: "393x873  телефон вдоль", width: 393, height: 873, mobile: true },
  { label: "412x915  крупный вдоль", width: 412, height: 915, mobile: true },
  { label: "640x360  малый поперёк", width: 640, height: 360, mobile: true },
  { label: "873x393  телефон поперёк", width: 873, height: 393, mobile: true },
  { label: "915x412  крупный поперёк", width: 915, height: 412, mobile: true },
  { label: "1280x576 Redmi поперёк", width: 1280, height: 576, mobile: true },
  { label: "768x1024 планшет вдоль", width: 768, height: 1024, mobile: true },
  { label: "1024x768 планшет поперёк", width: 1024, height: 768, mobile: true },
  { label: "1366x768 ноутбук", width: 1366, height: 768, mobile: false },
  { label: "1920x1080 монитор", width: 1920, height: 1080, mobile: false },
  { label: "2560x1440 телевизор", width: 2560, height: 1440, mobile: false }
];

/** Where the fight is only walked on a few sizes: it costs twenty seconds each. */
const BATTLE_SIZES = new Set([
  "393x873  телефон вдоль",
  "873x393  телефон поперёк",
  "1280x576 Redmi поперёк",
  "1920x1080 монитор"
]);

async function inspect(page, screen, mustSee) {
  return await page.evaluate(
    ({ screen: name, mustSee: wanted }) => {
      const findings = [];
      const view = { width: window.innerWidth, height: window.innerHeight };
      const root = document.documentElement;
      if (root.scrollWidth > view.width + 1) {
        findings.push(`страница шире окна на ${String(root.scrollWidth - view.width)}px`);
      }
      for (const selector of wanted) {
        const element = document.querySelector(selector);
        if (element === null) {
          findings.push(`нет элемента ${selector}`);
          continue;
        }
        const box = element.getBoundingClientRect();
        if (box.width === 0 || box.height === 0) {
          findings.push(`${selector} нулевого размера`);
          continue;
        }
        const outside = [];
        if (box.right > view.width + 1)
          outside.push(`справа на ${String(Math.round(box.right - view.width))}px`);
        if (box.left < -1) outside.push(`слева на ${String(Math.round(-box.left))}px`);
        if (box.bottom > view.height + 1)
          outside.push(`снизу на ${String(Math.round(box.bottom - view.height))}px`);
        if (box.top < -1) outside.push(`сверху на ${String(Math.round(-box.top))}px`);
        if (outside.length > 0) findings.push(`${selector} выходит ${outside.join(", ")}`);
        /*
         * And that a thumb landing on it reaches it. A control drawn in the
         * right place but under another panel is the same defect as one off
         * the screen, and only this question tells them apart.
         */
        if (!selector.startsWith(".cockpit") && !selector.includes("stick")) continue;
        const middle = document.elementFromPoint(
          (box.left + box.right) / 2,
          (box.top + box.bottom) / 2
        );
        if (middle !== null && !element.contains(middle) && !middle.contains(element)) {
          findings.push(`${selector} перекрыт ${middle.tagName}.${String(middle.className)}`);
        }
      }
      return { screen: name, findings };
    },
    { screen, mustSee }
  );
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
const report = [];

for (const size of SIZES) {
  const context = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    deviceScaleFactor: size.mobile ? 2 : 1,
    isMobile: size.mobile,
    hasTouch: size.mobile
  });
  const page = await context.newPage();
  const found = [];

  await page.goto(url, { waitUntil: "load" });
  await page.waitForSelector(".mode-tile");
  await sleep(400);
  found.push(
    await inspect(page, "старт", [
      ".mode-grid",
      ".mode-tile--campaign",
      ".mode-tile--arena",
      ".settings__toggle"
    ])
  );

  await page.getByRole("button", { name: "Кампания I: Завеса" }).click();
  await page.waitForSelector(".setup-card");
  await sleep(300);
  found.push(await inspect(page, "кампания", [".setup-card", ".setup-go", ".link-button"]));

  await page.getByRole("button", { name: "← Режимы" }).click();
  await page.getByRole("button", { name: "Арена: Талос" }).click();
  await page.waitForSelector(".setup-card");
  await sleep(300);
  found.push(await inspect(page, "арена", [".setup-card", ".setup-go", ".link-button"]));

  if (BATTLE_SIZES.has(size.label)) {
    await page.getByRole("button", { name: "← Режимы" }).click();
    await page.getByRole("button", { name: "Кампания I: Завеса" }).click();
    await page.getByRole("button", { name: "Соло" }).click();
    await page.getByRole("button", { name: "В бой" }).click();
    const ready = page.getByTestId("cockpit-ready");
    await ready.waitFor({ timeout: 60_000 });
    for (let attempt = 0; attempt < 120; attempt += 1) {
      if ((await ready.getAttribute("data-world-ready")) === "true") break;
      await sleep(500);
    }
    found.push(await inspect(page, "лобби", [".lobby-layout", ".cockpit-ready"]));
    await ready.click();
    // A portrait phone is asked to turn before it is given a battlefield, so
    // either of these appearing means the fight has started.
    const portrait = size.height > size.width;
    await page.waitForSelector(
      portrait
        ? '.rotate-notice, [data-testid="spaceship-world"]'
        : '[data-testid="spaceship-world"]',
      { timeout: 60_000 }
    );
    await sleep(3_000);
    found.push(
      await inspect(
        page,
        "бой",
        portrait
          ? [".display-shell--battle"]
          : [
              ".battle-header",
              ".combat-radar",
              ".solo-cockpit .cockpit-stick--left",
              ".solo-cockpit .cockpit-stick--right",
              ".cockpit-trigger",
              ".cockpit-assist",
              ".settings__toggle"
            ]
      )
    );
  }

  report.push({ size: size.label, screens: found.filter((entry) => entry.findings.length > 0) });
  await context.close();
}
await browser.close();

for (const row of report) {
  if (row.screens.length === 0) {
    console.log(`${row.size} — чисто`);
    continue;
  }
  console.log(row.size);
  for (const screen of row.screens) {
    for (const finding of screen.findings) console.log(`   ${screen.screen}: ${finding}`);
  }
}
