import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

const testHost = process.env.E2E_HOST?.trim() ?? "127.0.0.1";
const displayUrl = process.env.E2E_DISPLAY_URL ?? `http://${testHost}:5173`;
const controllerUrl = process.env.E2E_CONTROLLER_URL ?? `http://${testHost}:5174`;

test("three browser controllers fly, fire and shield one castle", async ({ browser }) => {
  test.setTimeout(45_000);
  const contexts: BrowserContext[] = [];
  try {
    const displayContext = await browser.newContext();
    contexts.push(displayContext);
    const display = await displayContext.newPage();
    await display.goto(displayUrl);
    await display.getByRole("button", { name: "Создать комнату" }).click();
    const roomCode = (await display.locator(".room-code").textContent())?.trim();
    if (!roomCode) throw new Error("Display did not publish a room code.");

    const pilot = await newController(browser, contexts, roomCode, "Пилот Алекс");
    const gunner = await newController(browser, contexts, roomCode, "Наводчик Сэм");
    const shield = await newController(browser, contexts, roomCode, "Щит Ли");
    await expect(pilot.locator(".role-badge")).toHaveText("Пилот");
    await expect(gunner.locator(".role-badge")).toHaveText("Наводчик");
    await expect(shield.locator(".role-badge")).toHaveText("Оператор щита");
    await Promise.all(
      [pilot, gunner, shield].map((page) => page.getByRole("button", { name: "Я готов" }).click())
    );

    await expect(display.locator(".phase-badge")).toHaveText("Замок в полёте");
    await expect(display.getByTestId("flying-castle-world")).toBeVisible();
    await expect(display.locator(".battlefield-canvas canvas")).toBeVisible();

    const startX = Number(
      await display.getByTestId("flying-castle-world").getAttribute("data-castle-x")
    );
    await pilot.keyboard.down("KeyD");
    await expect
      .poll(async () =>
        Number(await display.getByTestId("flying-castle-world").getAttribute("data-castle-x"))
      )
      .toBeGreaterThan(startX);
    await pilot.keyboard.up("KeyD");

    const xBeforeStick = Number(
      await display.getByTestId("flying-castle-world").getAttribute("data-castle-x")
    );
    const stickBounds = await pilot.getByTestId("virtual-stick").boundingBox();
    if (stickBounds === null) throw new Error("Pilot virtual stick has no bounds.");
    await pilot.mouse.move(
      stickBounds.x + stickBounds.width / 2,
      stickBounds.y + stickBounds.height / 2
    );
    await pilot.mouse.down();
    await pilot.mouse.move(
      stickBounds.x + stickBounds.width * 0.9,
      stickBounds.y + stickBounds.height / 2
    );
    await expect
      .poll(async () =>
        Number(await display.getByTestId("flying-castle-world").getAttribute("data-castle-x"))
      )
      .toBeGreaterThan(xBeforeStick);
    await pilot.mouse.up();

    await gunner.getByTestId("fire-button").hover();
    await gunner.mouse.down();
    await expect
      .poll(async () =>
        Number(
          await display.getByTestId("flying-castle-world").getAttribute("data-projectile-count")
        )
      )
      .toBeGreaterThan(0);
    await gunner.mouse.up();

    await shield.getByTestId("shield-button").hover();
    await shield.mouse.down();
    await expect(display.getByTestId("flying-castle-world")).toHaveAttribute(
      "data-shield-active",
      "true"
    );
    await shield.mouse.up();
    await expect(display.getByTestId("flying-castle-world")).toHaveAttribute(
      "data-shield-active",
      "false"
    );

    await pilot.reload();
    await expect(pilot.locator(".connection")).toHaveText("В сети");
    await expect(pilot.locator(".role-badge")).toHaveText("Пилот");

    const fourth = await newController(browser, contexts, roomCode, "Лишний", false);
    await expect(fourth.locator(".error-message")).toHaveText("Все три роли уже заняты.");
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

async function newController(
  browser: Browser,
  contexts: BrowserContext[],
  roomCode: string,
  name: string,
  expectConnected = true
): Promise<Page> {
  const context = await browser.newContext();
  contexts.push(context);
  const page = await context.newPage();
  await page.goto(`${controllerUrl}/?room=${encodeURIComponent(roomCode)}`);
  await page.getByLabel("Имя").fill(name);
  await page.getByRole("button", { name: "Подключиться" }).click();
  if (expectConnected) await expect(page.locator(".connection")).toHaveText("В сети");
  return page;
}
