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

  // A hull under autopilot is never still, so "it moved" proves nothing. A held
  // key does: the helm turns for as long as it is down, and the autopilot has
  // no reason to turn one way for a second and a half on cue.
  const before = await readNumber(world, "data-spaceship-heading");
  await page.keyboard.down("KeyD");
  await page.waitForTimeout(1_500);
  const turned = await readNumber(world, "data-spaceship-heading");
  await page.keyboard.up("KeyD");

  expect(shortestDelta(turned, before)).toBeGreaterThan(0.5);
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
