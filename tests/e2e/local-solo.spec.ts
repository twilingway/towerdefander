import { expect, test, type Page } from "@playwright/test";

const testHost = process.env.E2E_HOST?.trim() ?? "127.0.0.1";
const displayUrl = process.env.E2E_DISPLAY_URL ?? `http://${testHost}:5173`;
const serverPort = process.env.E2E_SERVER_PORT ?? "35678";

/**
 * The claim this spec exists to hold: a run plays with the game server cut off.
 *
 * Which is why the block comes first and covers every scheme the page could
 * reach it by. A local run that quietly fell back to a room would otherwise
 * pass here for the wrong reason, and the whole point of the mode is that there
 * is nothing to fall back to.
 */
async function cutTheServerOff(page: Page): Promise<string[]> {
  const blocked: string[] = [];
  await page.route(`**://*:${serverPort}/**`, async (route) => {
    blocked.push(route.request().url());
    await route.abort();
  });
  return blocked;
}

test("a campaign run plays on the device with no server", async ({ page }) => {
  test.setTimeout(60_000);
  const blocked = await cutTheServerOff(page);

  await page.goto(`${displayUrl}/solo?diag=1`);

  // A wave, not a lobby: the run starts itself, because a cold visit to this
  // address is the whole product in an app shell.
  const counts = page.getByTestId("hud-field-counts");
  await expect(counts).toBeVisible();
  await expect
    .poll(
      async () => {
        const text = (await counts.textContent()) ?? "";
        return Number(/Враги (\d+)/.exec(text)?.[1] ?? "0");
      },
      { timeout: 20_000 }
    )
    .toBeGreaterThan(0);

  // The clock counts down from the run's own ticks.
  const timer = page.getByTestId("timer-frame");
  const firstReading = (await timer.textContent()) ?? "";
  await expect
    .poll(async () => (await timer.textContent()) ?? "", { timeout: 10_000 })
    .not.toBe(firstReading);

  // Nothing about a room, because there is none.
  await expect(page.locator(".room-code")).toHaveCount(0);
  await expect(page.getByTestId("diagnostics-ping")).toHaveText("—");
  // The way out leaves the run; there is no room to close for anybody else.
  await page.getByRole("button", { name: "Настройки" }).click();
  const window = page.getByTestId("settings-window");
  await expect(window.getByRole("button", { name: "Выйти", exact: true })).toBeVisible();
  await expect(window.getByText("Закрыть комнату")).toHaveCount(0);

  expect(blocked, "the page reached for the game server").toEqual([]);
});

test("the ship answers the keyboard, locally", async ({ page }) => {
  test.setTimeout(60_000);
  await cutTheServerOff(page);

  await page.goto(`${displayUrl}/solo?diag=1`);
  const world = page.getByTestId("spaceship-world");
  await expect(world).toBeVisible();

  const startedAt = await readHeading(world);
  await page.keyboard.down("KeyA");
  await expect
    .poll(async () => Math.abs(angleGap(await readHeading(world), startedAt)), { timeout: 10_000 })
    .toBeGreaterThan(0.2);
  await page.keyboard.up("KeyA");
});

async function readHeading(world: ReturnType<Page["getByTestId"]>): Promise<number> {
  const raw = await world.getAttribute("data-spaceship-heading");
  return Number(raw ?? "0");
}

/** Shortest way round, so a pass through π does not read as a huge turn. */
function angleGap(left: number, right: number): number {
  return Math.atan2(Math.sin(left - right), Math.cos(left - right));
}
