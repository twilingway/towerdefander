import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page
} from "@playwright/test";

const testHost = process.env.E2E_HOST?.trim() ?? "127.0.0.1";
const displayUrl = process.env.E2E_DISPLAY_URL ?? `http://${testHost}:5173`;
const controllerUrl = process.env.E2E_CONTROLLER_URL ?? `http://${testHost}:5174`;

const soloControllerContext = {
  viewport: { width: 844, height: 390 },
  hasTouch: true,
  isMobile: true
} as const;

test("one player flies and aims from a single panel", async ({ browser }) => {
  test.setTimeout(60_000);
  const contexts: BrowserContext[] = [];
  try {
    const displayContext = await browser.newContext();
    contexts.push(displayContext);
    const display = await displayContext.newPage();
    await display.goto(displayUrl);
    await display.getByRole("button", { name: "1 игрок" }).click();
    await display.getByRole("button", { name: "Создать комнату" }).click();
    await expect(display.getByRole("heading", { name: "Подключите контроллер" })).toBeVisible();
    const roomCode = (await display.locator(".room-code").textContent())?.trim();
    if (!roomCode) throw new Error("Display did not publish a room code.");

    // The lobby is where the room is set up and the browser will only grant
    // fullscreen from a click, so the switch lives here. A component test
    // cannot see it at all: rendered without a document it reads the API as
    // missing and draws nothing.
    const fullscreen = display.getByTestId("fullscreen-button");
    await expect(fullscreen).toHaveText("Развернуть на весь экран");
    await expect(fullscreen).toHaveAttribute("aria-pressed", "false");

    const solo = await joinSolo(browser, contexts, roomCode);
    await expect(solo.locator('[data-testid="solo-panel"]')).toBeVisible();
    await expect(solo.locator('[data-testid="virtual-stick"]')).toHaveCount(2);

    const world = display.getByTestId("spaceship-world");
    // Turning must work with the engine off, the way a tank turns in place.
    const restingHeading = await readNumber(world, "data-spaceship-heading");
    // A tank keeps turning for as long as the key is down; absolute steering
    // would settle on one bearing and stop, so both halves of the hold matter.
    await solo.keyboard.down("KeyD");
    await solo.waitForTimeout(700);
    const midTurnHeading = await readNumber(world, "data-spaceship-heading");
    await solo.waitForTimeout(700);
    const turnedHeading = await readNumber(world, "data-spaceship-heading");
    await solo.keyboard.up("KeyD");
    await solo.waitForTimeout(150);
    expect(shortestDelta(midTurnHeading, restingHeading)).toBeGreaterThan(0.5);
    expect(shortestDelta(turnedHeading, midTurnHeading)).toBeGreaterThan(0.5);

    // Thrust follows the nose, so the ship leaves along the course it now holds.
    const startX = await readNumber(world, "data-spaceship-x");
    const startY = await readNumber(world, "data-spaceship-y");
    await hold(solo, "KeyW", 1500);
    const movedX = (await readNumber(world, "data-spaceship-x")) - startX;
    const movedY = (await readNumber(world, "data-spaceship-y")) - startY;
    expect(Math.hypot(movedX, movedY)).toBeGreaterThan(120);
    /*
     * Against the nose it ends on, not the one it started from. The hull is
     * still settling onto the bearing the turn asked for while the thrust
     * pushes, so the path is an arc: measured from where the nose was, the
     * travel is off by the part of the turn that happened during it.
     */
    const heldHeading = await readNumber(world, "data-spaceship-heading");
    expect(shortestDelta(Math.atan2(movedY, movedX), heldHeading)).toBeLessThan(0.6);

    // The arrows drive the second stream from the same connection.
    const restingTurret = await readNumber(world, "data-turret-angle");
    await hold(solo, "ArrowDown", 1500);
    expect(
      shortestDelta(await readNumber(world, "data-turret-angle"), restingTurret)
    ).toBeGreaterThan(0.3);

    /*
     * The hull's throttle is the length of the push, and it is all the way open
     * at a third of the ring: pushed to the rim and pushed a third of the way,
     * the ship has to end up going the same speed.
     *
     * Speed rather than ground covered, which is what this used to measure. The
     * second run starts wherever the first one left the hull, and a hull that
     * ended near the rim spends its run against the cushion - so the distance
     * says as much about where the ship was as about how far the stick went.
     */
    const courseStick = solo.locator(".solo-stick--pilot [data-testid='virtual-stick']");
    const courseBounds = await courseStick.boundingBox();
    if (courseBounds === null) throw new Error("Solo course stick has no bounds.");
    const rimSpeed = await speedWhileHeld(solo, world, courseBounds, 0.95);
    const thirdSpeed = await speedWhileHeld(solo, world, courseBounds, 0.35);
    expect(rimSpeed).toBeGreaterThan(100);
    // Equal is the point: a third of the ring is the whole throttle, so the two
    // runs land on the same speed and a strict "greater" fails on a tie.
    expect(thirdSpeed).toBeGreaterThanOrEqual(rimSpeed * 0.9);

    // The turret stick is the one control that reads a push and a tap
    // differently: past six tenths it names a bearing, short of it the barrel
    // keeps what it had and the tap is a round. Solo owns both seats from one
    // panel, so it has to hold here too.
    const turretStick = solo.locator(".solo-stick--gunner [data-testid='virtual-stick']");
    const stickBounds = await turretStick.boundingBox();
    if (stickBounds === null) throw new Error("Solo turret stick has no bounds.");
    const centreX = stickBounds.x + stickBounds.width / 2;
    const centreY = stickBounds.y + stickBounds.height / 2;

    await solo.mouse.click(centreX, stickBounds.y + stickBounds.height * 0.15);
    await expect
      .poll(async () => Number(await world.getAttribute("data-turret-angle")))
      .toBeCloseTo(-Math.PI / 2, 1);

    const heldBearing = await readNumber(world, "data-turret-angle");
    const shotBeforeTap = await world.getAttribute("data-latest-projectile-id");
    await solo.mouse.click(centreX, centreY + stickBounds.height * 0.06);
    await expect
      .poll(async () => world.getAttribute("data-latest-projectile-id"))
      .not.toBe(shotBeforeTap);
    expect(await readNumber(world, "data-turret-angle")).toBeCloseTo(heldBearing, 1);

    // The scene reports the loop it is running, which the snapshot cannot know.
    await expect
      .poll(async () => Number(await display.getByTestId("fps-value").innerText()))
      .toBeGreaterThan(1);

    await expect(solo.locator(".connection")).toHaveText("В сети");
  } finally {
    for (const context of contexts) await context.close();
  }
});

/**
 * Ground covered in half a second with the stick held at a share of its travel,
 * pushed along +x from the middle.
 */
/** How fast the hull ends up going while the stick is held at `share` of the ring. */
async function speedWhileHeld(
  page: Page,
  world: Locator,
  stick: { x: number; y: number; width: number; height: number },
  share: number
): Promise<number> {
  const centreX = stick.x + stick.width / 2;
  const centreY = stick.y + stick.height / 2;
  await page.mouse.move(centreX, centreY);
  await page.mouse.down();
  await page.mouse.move(centreX + (stick.width / 2) * share, centreY);
  // Long enough to be up to speed before the reading is taken.
  await page.waitForTimeout(900);
  // Along the axis the stick pushes on: the world only publishes the one
  // component, and the push in this test is horizontal.
  const speed = Math.abs(await readNumber(world, "data-spaceship-velocity-x"));
  await page.mouse.up();
  await page.waitForTimeout(400);
  return speed;
}

async function joinSolo(
  browser: Browser,
  contexts: BrowserContext[],
  roomCode: string
): Promise<Page> {
  const context = await browser.newContext(soloControllerContext);
  contexts.push(context);
  const page = await context.newPage();
  await page.goto(`${controllerUrl}/?room=${encodeURIComponent(roomCode)}`);
  await page.getByLabel("Имя").fill("Соло");
  await page.getByRole("button", { name: "Подключиться" }).click();
  await expect(page.locator(".connection")).toHaveText("В сети");
  await page.getByRole("button", { name: "Готов" }).click();
  return page;
}

async function hold(page: Page, key: string, milliseconds: number): Promise<void> {
  await page.keyboard.down(key);
  await page.waitForTimeout(milliseconds);
  await page.keyboard.up(key);
  await page.waitForTimeout(150);
}

async function readNumber(world: Locator, attribute: string): Promise<number> {
  const value = await world.getAttribute(attribute);
  return Number(value);
}

/** Absolute angular distance, so a wrap past π does not read as a huge jump. */
function shortestDelta(left: number, right: number): number {
  const delta = Math.abs(((left - right + Math.PI) % (2 * Math.PI)) - Math.PI);
  return delta;
}
