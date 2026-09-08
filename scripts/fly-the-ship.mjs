/**
 * Flies the ship for as long as a measurement lasts.
 *
 * A parked ship measures a still picture: no thrust, no shells, no focus rings,
 * no hulls crossing the camera, and the frame counter reports a screensaver.
 * Both harnesses need the same movement for their numbers to be comparable, so
 * it lives here rather than twice.
 *
 * The keys are the solo cockpit's own: W drives, A and D turn, Space is the
 * nose gun and Enter the cannon.
 */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Held for `durationMs`, then everything released - a stuck key outlives the run. */
export async function flyForMs(page, durationMs) {
  await page.keyboard.down("KeyW");
  await page.keyboard.down("Space");
  let turningRight = true;
  const until = Date.now() + durationMs;
  try {
    while (Date.now() < until) {
      const turn = turningRight ? "KeyD" : "KeyA";
      await page.keyboard.down(turn);
      await page.keyboard.down("Enter");
      await sleep(420);
      await page.keyboard.up("Enter");
      await page.keyboard.up(turn);
      turningRight = !turningRight;
      await sleep(180);
    }
  } finally {
    await page.keyboard.up("Space");
    await page.keyboard.up("KeyW");
  }
}
