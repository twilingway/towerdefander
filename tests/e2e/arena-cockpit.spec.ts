import { expect, test, type Locator } from "@playwright/test";

const testHost = process.env.E2E_HOST?.trim() ?? "127.0.0.1";
const displayUrl = process.env.E2E_DISPLAY_URL ?? `http://${testHost}:5173`;

/**
 * The arena's cockpit, end to end, because the half that broke has no unit.
 *
 * A player sat in a match and watched a bot fly their hull. Nothing was wrong
 * with the room, the input stream or the sticks: the arena screen handed the
 * pilot's name up, and the route dropped it on the way to the session - so the
 * connection joined as a spectator and both ends agreed, correctly, that nobody
 * was flying. That is a wiring defect between two components, which is exactly
 * the shape a browser finds and a component test cannot.
 */
test("the arena seats the player rather than a bot", async ({ page }) => {
  // The waiting room is ten seconds while the mode is being tested, and the
  // bots then take the empty seats over another two and a half.
  test.setTimeout(90_000);

  await page.goto(displayUrl);
  await page.getByRole("button", { name: "Арена: Талос" }).click();
  // The screen opens on "this device is the whole game", which is the case
  // under test; saying so out loud keeps the spec honest if the default moves.
  await page.getByRole("button", { name: "Соло" }).click();
  await page.getByRole("button", { name: "В бой" }).click();

  const world = page.getByTestId("spaceship-world");
  await expect(world).toBeVisible({ timeout: 45_000 });

  /*
   * A hull under autopilot is never still, so "it moved" proves nothing. A held
   * key does: the helm turns for as long as it is down, and the autopilot has no
   * reason to turn one way on cue.
   *
   * Summed step by step rather than measured end to end. This hull turns at four
   * radians a second, so a hold of any useful length carries it past a full
   * circle and the difference between two bearings wraps back to nearly nothing
   * - which is a test that fails when the helm works perfectly.
   */
  await page.keyboard.down("KeyD");
  let previous = await readNumber(world, "data-spaceship-heading");
  let turned = 0;
  for (let sample = 0; sample < 6; sample += 1) {
    await page.waitForTimeout(120);
    const now = await readNumber(world, "data-spaceship-heading");
    turned += shortestDelta(now, previous);
    previous = now;
  }
  await page.keyboard.up("KeyD");

  expect(turned).toBeGreaterThan(1);
});

test("the match shows its own readouts, on the top edge", async ({ page }) => {
  test.setTimeout(90_000);

  await page.goto(displayUrl);
  await page.getByRole("button", { name: "Арена: Талос" }).click();
  await page.getByRole("button", { name: "Соло" }).click();
  await page.getByRole("button", { name: "В бой" }).click();

  await expect(page.getByTestId("spaceship-world")).toBeVisible({ timeout: 45_000 });

  /*
   * Visible, and in the half of the screen it was designed for.
   *
   * The campaign's header is pinned to the bottom edge as a grid that flanks
   * the dial, and the match panel inherited that placement - it rendered every
   * frame, behind the radar, where nobody could see it. A class being present
   * is therefore not the test; where the box lands is.
   */
  const kills = page.getByTestId("arena-hud-kills");
  await expect(kills).toBeVisible();
  const box = await kills.boundingBox();
  const viewport = page.viewportSize();
  if (box === null || viewport === null) throw new Error("the readout has no box");
  expect(box.y).toBeLessThan(viewport.height / 3);

  /*
   * And it is lifted over the world rather than lying under it.
   *
   * Playwright calls an element visible when it has a box and is not hidden,
   * which a header left in normal flow underneath the whole battlefield canvas
   * satisfies perfectly - it rendered, in the right place, and no one could see
   * it. The panel is pointer-transparent, so hit-testing cannot answer this
   * either; what says it is the stacking it was given.
   */
  const stacking = await page.evaluate(() => {
    const header = document.querySelector(".arena-hud");
    if (header === null) return null;
    const style = getComputedStyle(header);
    return { position: style.position, zIndex: Number(style.zIndex) };
  });
  expect(stacking?.position).not.toBe("static");
  expect(stacking?.zIndex).toBeGreaterThanOrEqual(20);

  // And the campaign's own three are gone: a match has no waves and no economy.
  await expect(page.getByText("Кредиты", { exact: true })).toHaveCount(0);
});

async function readNumber(target: Locator, attribute: string): Promise<number> {
  const raw = await target.getAttribute(attribute);
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${attribute} was not a number: ${String(raw)}`);
  return value;
}

/** Absolute angle between two bearings, the short way round. */
function shortestDelta(first: number, second: number): number {
  return Math.abs(Math.atan2(Math.sin(first - second), Math.cos(first - second)));
}
