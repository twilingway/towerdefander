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
    await expect(display.locator(".latency-indicator")).toHaveText(/\d+ мс/, {
      timeout: 5_000
    });
    await expect(pilot.locator(".latency-indicator")).toHaveText(/\d+ мс/, {
      timeout: 5_000
    });
    await expect(display.locator(".crew-latency-overlay span")).toHaveText([
      /Экран → сервер \d+ мс/,
      /Пилот \d+ мс/,
      /Наводчик \d+ мс/,
      /Щит \d+ мс/
    ]);
    await assertResponsiveBattlefield(display);

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

    const world = display.getByTestId("flying-castle-world");
    const turretBeforeFire = Number(await world.getAttribute("data-turret-angle"));
    const fireBounds = await gunner.getByTestId("fire-button").boundingBox();
    if (fireBounds === null) throw new Error("Fire button has no bounds.");
    await gunner.mouse.click(fireBounds.x + 8, fireBounds.y + fireBounds.height - 8);
    await expect
      .poll(async () => Number(await world.getAttribute("data-projectile-count")))
      .toBeGreaterThan(0);
    expect(Number(await world.getAttribute("data-turret-angle"))).toBeCloseTo(turretBeforeFire, 5);

    const gunnerStickBounds = await gunner.getByTestId("virtual-stick").boundingBox();
    if (gunnerStickBounds === null) throw new Error("Gunner virtual stick has no bounds.");
    await gunner.mouse.click(
      gunnerStickBounds.x + gunnerStickBounds.width / 2,
      gunnerStickBounds.y + gunnerStickBounds.height * 0.15
    );
    await expect
      .poll(async () => Number(await world.getAttribute("data-turret-angle")))
      .toBeLessThan(-0.5);

    await assertFireStopsAfter(gunner, world, fireBounds, "pointercancel");
    await assertFireStopsAfter(gunner, world, fireBounds, "lostpointercapture");
    await assertFireStopsAfter(gunner, world, fireBounds, "blur");

    const shieldStickBounds = await shield.getByTestId("virtual-stick").boundingBox();
    if (shieldStickBounds === null) throw new Error("Shield virtual stick has no bounds.");
    await shield.mouse.click(
      shieldStickBounds.x + shieldStickBounds.width / 2,
      shieldStickBounds.y + shieldStickBounds.height * 0.15
    );
    await expect(world).toHaveAttribute("data-shield-active", "false");
    await expect
      .poll(async () => Number(await world.getAttribute("data-shield-angle")))
      .toBeLessThan(-0.5);

    const fullShieldEnergy = Number(await world.getAttribute("data-shield-energy"));
    await shield.getByTestId("shield-button").click();
    await expect(world).toHaveAttribute("data-shield-active", "true");
    await expect
      .poll(async () => Number(await world.getAttribute("data-shield-energy")))
      .toBeLessThan(fullShieldEnergy);
    await expect(world).toHaveAttribute("data-shield-active", "false", { timeout: 7000 });
    const depletedShieldEnergy = Number(await world.getAttribute("data-shield-energy"));
    expect(depletedShieldEnergy).toBeLessThan(20);
    await expect
      .poll(async () => Number(await world.getAttribute("data-shield-energy")), { timeout: 3000 })
      .toBeGreaterThan(Math.max(10, depletedShieldEnergy));
    await shield.getByTestId("shield-button").click();
    await expect(world).toHaveAttribute("data-shield-active", "true");
    const drainedShieldEnergy = Number(await world.getAttribute("data-shield-energy"));
    await shield.getByTestId("shield-button").click();
    await expect(world).toHaveAttribute("data-shield-active", "false");
    await expect
      .poll(async () => Number(await world.getAttribute("data-shield-energy")))
      .toBeGreaterThan(drainedShieldEnergy);
    await shield.keyboard.press("Space");
    await expect(world).toHaveAttribute("data-shield-active", "true");
    await shield.keyboard.press("Space");
    await expect(world).toHaveAttribute("data-shield-active", "false");

    await pilot.reload();
    await expect(pilot.locator(".connection")).toHaveText("В сети");
    await expect(pilot.locator(".role-badge")).toHaveText("Пилот");

    const fourth = await newController(browser, contexts, roomCode, "Лишний", false);
    await expect(fourth.locator(".error-message")).toHaveText("Все три роли уже заняты.");
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

async function assertResponsiveBattlefield(display: Page): Promise<void> {
  const canvas = display.locator(".battlefield-canvas canvas");
  await expect(canvas).toHaveCount(1);

  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1366, height: 768 },
    { width: 1024, height: 768 }
  ]) {
    await display.setViewportSize(viewport);
    await expect
      .poll(async () => {
        const bounds = await display.getByTestId("flying-castle-world").boundingBox();
        return bounds === null
          ? undefined
          : { width: Math.round(bounds.width), height: Math.round(bounds.height) };
      })
      .toEqual(viewport);
  }

  await expect(canvas).toHaveCount(1);
  await display.setViewportSize({ width: 1280, height: 720 });
}

async function assertFireStopsAfter(
  gunner: Page,
  world: Locator,
  fireBounds: { x: number; y: number; width: number; height: number },
  reason: "pointercancel" | "lostpointercapture" | "blur"
): Promise<void> {
  const x = fireBounds.x + fireBounds.width / 2;
  const y = fireBounds.y + fireBounds.height / 2;
  await gunner.mouse.move(x, y);
  await gunner.mouse.down();
  await gunner.waitForTimeout(300);
  if (reason === "blur") {
    await gunner.evaluate(() => {
      const browserGlobal = globalThis as unknown as {
        dispatchEvent(event: unknown): boolean;
        Event: new (type: string) => unknown;
      };
      browserGlobal.dispatchEvent(new browserGlobal.Event("blur"));
    });
  } else {
    await gunner.getByTestId("fire-button").dispatchEvent(reason, {
      pointerId: 1,
      isPrimary: true,
      button: 0
    });
  }
  await gunner.waitForTimeout(100);
  const latestProjectileId = await world.getAttribute("data-latest-projectile-id");
  expect(latestProjectileId).not.toBe("");
  await gunner.waitForTimeout(350);
  expect(await world.getAttribute("data-latest-projectile-id")).toBe(latestProjectileId);
  await gunner.mouse.up();
}

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
