import { expect, test, type Page } from "@playwright/test";

const testHost = process.env.E2E_HOST?.trim() ?? "127.0.0.1";
const displayUrl = process.env.E2E_DISPLAY_URL ?? `http://${testHost}:5173`;
const serverPort = process.env.E2E_SERVER_PORT ?? "35678";

/**
 * A training match plays with the game server cut off.
 *
 * The block comes first for the same reason it does in `local-solo.spec.ts`: a
 * training page that quietly opened a room would pass the rest of this spec
 * for the wrong reason.
 */
async function cutTheServerOff(page: Page): Promise<string[]> {
  const blocked: string[] = [];
  await page.route(`**://*:${serverPort}/**`, async (route) => {
    blocked.push(route.request().url());
    await route.abort();
  });
  return blocked;
}

test("a training match plays on the device with no server", async ({ page }) => {
  test.setTimeout(60_000);
  const blocked = await cutTheServerOff(page);

  await page.goto(`${displayUrl}/arena/training?diag=1`);

  await expect(page.getByTestId("spaceship-world")).toBeVisible({ timeout: 30_000 });

  // The whole field, the same count a server match seats.
  await expect(page.locator(".info-frame")).toContainText("/16");
  await expect(page.getByTestId("arena-hud-kills")).toBeVisible();

  // The match's own clock is running.
  const timer = page.getByTestId("timer-frame");
  const firstReading = (await timer.textContent()) ?? "";
  await expect
    .poll(async () => (await timer.textContent()) ?? "", { timeout: 10_000 })
    .not.toBe(firstReading);

  // The sweep answers from the device: pressed, it goes into its cooldown.
  const scan = page.getByTestId("arena-scan");
  await expect(scan).toBeEnabled();
  await scan.click();
  await expect(scan).toBeDisabled({ timeout: 5_000 });

  await expect(page.locator(".room-code")).toHaveCount(0);
  expect(blocked, "the page reached for the game server").toEqual([]);
});
