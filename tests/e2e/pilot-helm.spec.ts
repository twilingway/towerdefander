import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

const testHost = process.env.E2E_HOST?.trim() ?? "127.0.0.1";
const displayUrl = process.env.E2E_DISPLAY_URL ?? `http://${testHost}:5173`;
const controllerUrl = process.env.E2E_CONTROLLER_URL ?? `http://${testHost}:5174`;

test("a seated pilot steers the hull like a tank", async ({ browser }) => {
  test.setTimeout(60_000);
  const contexts: BrowserContext[] = [];
  try {
    const displayContext = await browser.newContext();
    contexts.push(displayContext);
    const display = await displayContext.newPage();
    await display.goto(displayUrl);
    await display.getByRole("button", { name: "Создать комнату" }).click();
    const roomCode = (await display.locator(".room-code").textContent())?.trim();
    if (!roomCode) throw new Error("Display did not publish a room code.");

    const crew: Page[] = [];
    for (const name of ["Пилот", "Наводчик", "Щит"]) {
      crew.push(await joinController(browser, contexts, roomCode, name));
    }
    for (const page of crew) await page.getByRole("button", { name: "Готов" }).click();
    const pilot = crew[0];
    if (pilot === undefined) throw new Error("Expected a pilot page.");

    const world = display.getByTestId("spaceship-world");
    await expect(world).toBeVisible();
    const restingHeading = await readNumber(world, "data-spaceship-heading");
    // A tank keeps turning for as long as the key is down; absolute steering
    // would settle on one bearing and stop, so both halves of the hold matter.
    await pilot.keyboard.down("KeyA");
    await pilot.waitForTimeout(700);
    const midTurnHeading = await readNumber(world, "data-spaceship-heading");
    await pilot.waitForTimeout(700);
    const turnedHeading = await readNumber(world, "data-spaceship-heading");
    await pilot.keyboard.up("KeyA");
    await pilot.waitForTimeout(150);
    expect(shortestDelta(midTurnHeading, restingHeading)).toBeGreaterThan(0.5);
    expect(shortestDelta(turnedHeading, midTurnHeading)).toBeGreaterThan(0.5);

    const startX = await readNumber(world, "data-spaceship-x");
    const startY = await readNumber(world, "data-spaceship-y");
    await hold(pilot, "KeyW", 1500);
    const movedX = (await readNumber(world, "data-spaceship-x")) - startX;
    const movedY = (await readNumber(world, "data-spaceship-y")) - startY;
    expect(Math.hypot(movedX, movedY)).toBeGreaterThan(120);
    expect(shortestDelta(Math.atan2(movedY, movedX), turnedHeading)).toBeLessThan(0.6);
  } finally {
    for (const context of contexts) await context.close();
  }
});

async function joinController(
  browser: Browser,
  contexts: BrowserContext[],
  roomCode: string,
  name: string
): Promise<Page> {
  const context = await browser.newContext();
  contexts.push(context);
  const page = await context.newPage();
  await page.goto(`${controllerUrl}/?room=${encodeURIComponent(roomCode)}`);
  await page.getByLabel("Имя").fill(name);
  await page.getByRole("button", { name: "Подключиться" }).click();
  await expect(page.locator(".connection")).toHaveText("В сети");
  return page;
}

async function hold(page: Page, key: string, milliseconds: number): Promise<void> {
  await page.keyboard.down(key);
  await page.waitForTimeout(milliseconds);
  await page.keyboard.up(key);
  await page.waitForTimeout(150);
}

async function readNumber(
  world: ReturnType<Page["getByTestId"]>,
  attribute: string
): Promise<number> {
  return Number(await world.getAttribute(attribute));
}

/** Absolute angular distance, so a wrap past π does not read as a huge jump. */
function shortestDelta(left: number, right: number): number {
  return Math.abs(((left - right + Math.PI) % (2 * Math.PI)) - Math.PI);
}
