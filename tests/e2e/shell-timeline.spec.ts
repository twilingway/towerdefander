import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { openCampaign } from "./openCampaign.js";

import {
  drawnSpeedRatios,
  foreignShellGaps,
  ownShellGaps,
  recordFrames,
  summarize,
  type GapSummary,
  type ProbedFrame,
  type ProbedShell
} from "./shellGap.js";

const testHost = process.env.E2E_HOST?.trim() ?? "127.0.0.1";
const displayUrl = process.env.E2E_DISPLAY_URL ?? `http://${testHost}:5173`;
const controllerUrl = process.env.E2E_CONTROLLER_URL ?? `http://${testHost}:5174`;

/*
 * A shell leaves the barrel that is drawn firing it.
 *
 * Measured, not eyeballed: the operator's report was two sentences about what a
 * picture looked like, and the only way to know a fix changed that picture is to
 * compute the gap from what the scene drew. The limits are the change's own
 * (`openspec/changes/shell-shooter-clock`).
 */
const OWN_MEDIAN_LIMIT = 15;
const FOREIGN_MEDIAN_LIMIT = 20;
/** The clock is brought to the present at a quarter of real time, plus frame-timing slack. */
const SPEED_RATIO_BAND = { low: 0.7, high: 1.3 };

test("the gap arithmetic tells a shell on the barrel's clock from one a lead behind", () => {
  const hullSpeed = 600;
  const shellSpeed = 700;
  const frameMs = 1000 / 60;
  const hullRadius = 40;
  const shellRadius = 5;
  const leadMs = 100;
  const frames = (shellLagMs: number): ProbedFrame[] =>
    Array.from({ length: 40 }, (_, index) => {
      const time = index * frameMs;
      const hullX = (hullSpeed * time) / 1000;
      // Fired straight up at frame 5; first seen a lead later.
      const firedAt = 5 * frameMs;
      const birthX = (hullSpeed * firedAt) / 1000;
      const birthY = hullRadius + shellRadius;
      const age = (time - firedAt - shellLagMs) / 1000;
      const shells: ProbedShell[] =
        time - firedAt >= leadMs
          ? [
              {
                id: "s",
                own: true,
                source: "machineGun",
                radius: shellRadius,
                visible: true,
                x: birthX,
                y: birthY + shellSpeed * age,
                velocityX: 0,
                velocityY: shellSpeed,
                birthX,
                birthY,
                spawnTick: 0
              }
            ]
          : [];
      return {
        time,
        hullX,
        hullY: 0,
        heading: Math.PI / 2,
        mountX: hullX,
        mountY: 0,
        turretRotation: Math.PI / 2,
        hullRadius,
        hulls: [],
        shells
      };
    });
  expect(ownShellGaps(frames(0))[0]).toBeLessThan(1);
  expect(ownShellGaps(frames(leadMs))[0]).toBeCloseTo((shellSpeed * leadMs) / 1000, 0);
});

/**
 * Flies a wide weaving circle with the nose gun firing - and, from a cockpit on
 * the drawing page itself, the cannon too, off to one side.
 */
async function flyAndFire(page: Page, durationMs: number, withCannon = true): Promise<void> {
  const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
  await page.mouse.move(viewport.width * 0.85, viewport.height * 0.3);
  await page.keyboard.down("KeyW");
  await page.keyboard.down("Space");
  if (withCannon) await page.mouse.down();
  const until = Date.now() + durationMs;
  while (Date.now() < until) {
    await page.keyboard.down("KeyA");
    await page.waitForTimeout(260);
    await page.keyboard.up("KeyA");
    await page.waitForTimeout(700);
  }
  if (withCannon) await page.mouse.up();
  await page.keyboard.up("Space");
  await page.keyboard.up("KeyW");
}

async function measure(
  page: Page,
  label: string,
  durationMs: number,
  /** The page whose keys fly the ship, when it is not the one drawing it. */
  pilot: Page = page
): Promise<{ own: GapSummary; foreign: GapSummary; speed: GapSummary; low: number }> {
  const frames = await recordFrames(page, durationMs, () =>
    flyAndFire(pilot, durationMs, pilot === page)
  );
  if (process.env.SHELL_PROBE_DUMP) {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(
      `${process.env.SHELL_PROBE_DUMP}/${label.replace(/ /g, "-")}.json`,
      JSON.stringify(frames)
    );
  }
  const ratios = drawnSpeedRatios(frames);
  const result = {
    own: summarize(ownShellGaps(frames)),
    foreign: summarize(foreignShellGaps(frames)),
    speed: summarize(ratios),
    // The tenth percentile: the slowest a shell is drawn, bar the odd outlier.
    low: -summarize(ratios.map((ratio) => -ratio)).p90
  };
  // The numbers are the deliverable; they go into the change's design notes.
  console.log(`[shell-timeline] ${label}: ${JSON.stringify({ frames: frames.length, ...result })}`);
  return result;
}

/**
 * A match always has rivals shooting; an opening campaign wave may not have
 * fired yet, so there the foreign limit applies only to shots that happened.
 */
function expectOnTheBarrel(result: Awaited<ReturnType<typeof measure>>, needsForeign: boolean) {
  expect(result.own.count, "own shells measured").toBeGreaterThan(5);
  expect(result.own.median).toBeLessThanOrEqual(OWN_MEDIAN_LIMIT);
  if (needsForeign) expect(result.foreign.count, "foreign shells measured").toBeGreaterThan(3);
  if (result.foreign.count > 3) {
    expect(result.foreign.median).toBeLessThanOrEqual(FOREIGN_MEDIAN_LIMIT);
  }
  expect(result.low).toBeGreaterThanOrEqual(SPEED_RATIO_BAND.low);
  expect(result.speed.p90).toBeLessThanOrEqual(SPEED_RATIO_BAND.high);
}

test("network arena: shells leave the drawn barrels", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto(`${displayUrl}/?diag=1`);
  await page.getByRole("button", { name: "Арена: Талос" }).click();
  await page.getByRole("button", { name: "Соло" }).click();
  await page.getByRole("button", { name: "В бой" }).click();
  await expect(page.getByTestId("spaceship-world")).toBeVisible({ timeout: 45_000 });
  // The bots take the empty seats a few seconds after the match opens.
  await page.waitForTimeout(4_000);
  expectOnTheBarrel(await measure(page, "network arena", 9_000), true);
});

test("network campaign: shells leave the drawn barrels", async ({ page }) => {
  test.setTimeout(120_000);
  // `?online` preselects the server tile; the default is the device-hosted run.
  await page.goto(`${displayUrl}/?diag=1&online`);
  await page.getByRole("button", { name: "Кампания I: Завеса" }).click();
  await page.getByRole("button", { name: "В бой" }).click();
  // A crew of one still readies up before the flight starts.
  await page.getByRole("button", { name: "Готов" }).click({ timeout: 30_000 });
  await expect(page.getByTestId("spaceship-world")).toBeVisible({ timeout: 45_000 });
  await page.waitForTimeout(3_000);
  expectOnTheBarrel(await measure(page, "network campaign", 14_000), false);
});

test("local campaign: shells leave the drawn barrels", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto(`${displayUrl}/solo?diag=1`);
  await expect(page.getByTestId("spaceship-world")).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(3_000);
  expectOnTheBarrel(await measure(page, "local campaign", 14_000), false);
});

test("local arena training: shells leave the drawn barrels", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto(`${displayUrl}/arena/training?diag=1`);
  await expect(page.getByTestId("spaceship-world")).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(3_000);
  expectOnTheBarrel(await measure(page, "local arena", 9_000), true);
});

test("shared screen: shells leave the drawn barrels", async ({ browser }) => {
  test.setTimeout(120_000);
  const contexts: BrowserContext[] = [];
  try {
    const displayContext = await browser.newContext();
    contexts.push(displayContext);
    const display = await displayContext.newPage();
    await display.goto(`${displayUrl}/?shared&diag=1`);
    await openCampaign(display, 1);
    const roomCode = (await display.locator(".room-code").textContent({ timeout: 30_000 }))?.trim();
    if (!roomCode) throw new Error("the display published no room code");

    // One phone flies it; the display draws everything, its crew's ship
    // included, on its own playback clock.
    const pilotContext = await browser.newContext({
      viewport: { width: 844, height: 390 },
      hasTouch: true,
      isMobile: true
    });
    contexts.push(pilotContext);
    const pilot = await pilotContext.newPage();
    await pilot.goto(`${controllerUrl}/?room=${encodeURIComponent(roomCode)}`);
    await pilot.getByLabel("Имя").fill("Соло");
    await pilot.getByRole("button", { name: "Подключиться" }).click();
    await expect(pilot.locator(".connection")).toHaveText("В сети");
    await pilot.getByRole("button", { name: "Готов" }).click();

    await expect(display.getByTestId("spaceship-world")).toBeVisible({ timeout: 45_000 });
    await display.waitForTimeout(3_000);
    expectOnTheBarrel(await measure(display, "shared screen", 12_000, pilot), false);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
