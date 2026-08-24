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

const mobileControllerContext = {
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true
} as const;

test("three browser controllers fly, fire and shield one spaceship", async ({ browser }) => {
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
    await markCrewReady([pilot, gunner, shield]);

    await expect(display.locator(".phase-badge")).toHaveText("Корабль в бою");
    await expect(display.getByTestId("spaceship-world")).toBeVisible();
    await expect(display.getByTestId("spaceship-world")).toHaveAttribute(
      "data-arena-radius",
      "2200"
    );
    await expect(display.getByTestId("spaceship-world")).toHaveAttribute(
      "data-world-width",
      "4400"
    );
    await expect(display.getByTestId("spaceship-world")).toHaveAttribute(
      "data-world-height",
      "4400"
    );
    await expect(display.locator(".battlefield-canvas canvas")).toBeVisible();
    await expect(display.getByTestId("machine-gun-heat")).toBeVisible();
    await expect(display.getByTestId("combat-radar")).toBeVisible();
    await expect(display.getByTestId("combat-radar-spaceship")).toBeVisible();
    await expect
      .poll(async () =>
        Number(await display.getByTestId("combat-radar").getAttribute("data-enemy-count"))
      )
      .toBeGreaterThan(0);
    await expect(display.locator(".latency-indicator")).toHaveText(/\d+ мс/, {
      timeout: 5_000
    });
    await expect(pilot.locator(".latency-indicator")).toHaveText(/\d+ мс/, {
      timeout: 5_000
    });
    await expect(display.locator(".crew-latency-overlay .latency-row")).toHaveText([
      /Экран → сервер \d+ мс/,
      /Пилот \d+ мс/,
      /Наводчик \d+ мс/,
      /Щит \d+ мс/
    ]);
    await assertResponsiveBattlefield(display);

    const startX = Number(
      await display.getByTestId("spaceship-world").getAttribute("data-spaceship-x")
    );
    await pilot.keyboard.down("KeyD");
    await expect
      .poll(async () =>
        Number(await display.getByTestId("spaceship-world").getAttribute("data-spaceship-x"))
      )
      .toBeGreaterThan(startX);
    await pilot.keyboard.up("KeyD");
    await assertSpaceshipInsideCircularArena(display.getByTestId("spaceship-world"));

    const heatBeforeFire = Number(
      await display.getByTestId("machine-gun-heat").getAttribute("data-heat")
    );
    const mgFireBounds = await pilot.getByTestId("mg-fire-button").boundingBox();
    if (mgFireBounds === null) throw new Error("Pilot machine gun button has no bounds.");
    await pilot.mouse.move(
      mgFireBounds.x + mgFireBounds.width / 2,
      mgFireBounds.y + mgFireBounds.height / 2
    );
    await pilot.mouse.down();
    await expect
      .poll(async () =>
        Number(await display.getByTestId("machine-gun-heat").getAttribute("data-heat"))
      )
      .toBeGreaterThan(heatBeforeFire);
    await pilot.mouse.up();

    const xBeforeStick = Number(
      await display.getByTestId("spaceship-world").getAttribute("data-spaceship-x")
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
        Number(await display.getByTestId("spaceship-world").getAttribute("data-spaceship-x"))
      )
      .toBeGreaterThan(xBeforeStick);
    await pilot.mouse.up();
    await assertSpaceshipInsideCircularArena(display.getByTestId("spaceship-world"));

    const world = display.getByTestId("spaceship-world");
    const turretBeforeFire = Number(await world.getAttribute("data-turret-angle"));
    const fireBounds = await gunner.getByTestId("fire-button").boundingBox();
    if (fireBounds === null) throw new Error("Fire button has no bounds.");
    await gunner.mouse.click(fireBounds.x + 8, fireBounds.y + fireBounds.height - 8);
    await expect
      .poll(async () => Number(await world.getAttribute("data-friendly-projectile-count")))
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

test("crew reaches defeat, starts a clean rematch and can leave", async ({ browser }) => {
  test.setTimeout(180_000);
  const contexts: BrowserContext[] = [];
  try {
    const displayContext = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    contexts.push(displayContext);
    const display = await displayContext.newPage();
    await display.goto(displayUrl);
    await display.getByRole("button", { name: "Создать комнату" }).click();
    const roomCode = (await display.locator(".room-code").textContent())?.trim();
    if (!roomCode) throw new Error("Display did not publish a room code.");

    const pilot = await newController(
      browser,
      contexts,
      roomCode,
      "Пилот Mobile",
      true,
      mobileControllerContext
    );
    const gunner = await newController(browser, contexts, roomCode, "Наводчик Desktop");
    const shield = await newController(
      browser,
      contexts,
      roomCode,
      "Щит Mobile",
      true,
      mobileControllerContext
    );
    await markCrewReady([pilot, gunner, shield]);

    const world = display.getByTestId("spaceship-world");
    await expect(display.locator(".phase-badge")).toHaveText("Корабль в бою");
    await assertFullscreenHud(display);

    const xBeforeTouch = Number(await world.getAttribute("data-spaceship-x"));
    await dragTouchRight(pilot.getByTestId("virtual-stick"), pilot);
    await expect
      .poll(async () => Number(await world.getAttribute("data-spaceship-x")))
      .toBeGreaterThan(xBeforeTouch);

    await shield.getByTestId("shield-button").tap();
    await expect(world).toHaveAttribute("data-shield-active", "true");
    await shield.getByTestId("shield-button").tap();
    await expect(world).toHaveAttribute("data-shield-active", "false");

    await expect(display.locator(".encounter-overlay--defeat")).toContainText("Корабль уничтожен", {
      timeout: 120_000
    });
    await Promise.all(
      [pilot, gunner, shield].map((page) =>
        expect(page.locator(".result-panel")).toContainText("Корабль уничтожен")
      )
    );
    await assertFullscreenHud(display);

    const previousRunNumber = Number(await world.getAttribute("data-run-number"));
    await Promise.all(
      [pilot, gunner, shield].map((page) =>
        page.getByRole("button", { name: "Играть ещё" }).click()
      )
    );
    await expect(display.locator(".encounter-overlay--result")).toBeHidden();
    await expect
      .poll(async () => Number(await world.getAttribute("data-run-number")))
      .toBe(previousRunNumber + 1);
    await expect(gunner.locator(".combat-summary")).toContainText("Волна 1");
    await expect
      .poll(async () => ({
        hp: Number(await world.getAttribute("data-spaceship-hp")),
        maxHp: Number(await world.getAttribute("data-spaceship-max-hp")),
        score: Number(await world.getAttribute("data-score")),
        friendlyProjectiles: Number(await world.getAttribute("data-friendly-projectile-count")),
        hostileProjectiles: Number(await world.getAttribute("data-hostile-projectile-count")),
        missiles: Number(await world.getAttribute("data-missile-count")),
        latestProjectileId: await world.getAttribute("data-latest-projectile-id")
      }))
      .toEqual({
        hp: 500,
        maxHp: 500,
        score: 0,
        friendlyProjectiles: 0,
        hostileProjectiles: 0,
        missiles: 0,
        latestProjectileId: ""
      });

    gunner.once("dialog", async (dialog) => dialog.accept());
    await gunner.getByRole("button", { name: "Выйти из комнаты" }).click();
    await expect(gunner.getByRole("button", { name: "Подключиться" })).toBeVisible();

    display.once("dialog", async (dialog) => dialog.accept());
    await display.getByRole("button", { name: "Закрыть комнату" }).click();
    await expect(display.getByRole("button", { name: "Создать комнату" })).toBeVisible();
    await Promise.all(
      [pilot, shield].map(async (page) => {
        await expect(page.getByRole("button", { name: "Подключиться" })).toBeVisible();
        await expect(page.locator(".error-message")).toContainText("Комната закрыта");
      })
    );
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
        const bounds = await display.getByTestId("spaceship-world").boundingBox();
        return bounds === null
          ? undefined
          : { width: Math.round(bounds.width), height: Math.round(bounds.height) };
      })
      .toEqual(viewport);
    const hudBounds = await display.locator(".spaceship-hud").boundingBox();
    if (hudBounds === null) throw new Error("Combat HUD has no bounds.");
    const radarBounds = await display.getByTestId("combat-radar").boundingBox();
    if (radarBounds === null) throw new Error("Combat radar has no bounds.");
    expect(Math.abs(radarBounds.width - radarBounds.height)).toBeLessThanOrEqual(1);
    expect(radarBounds.x).toBeGreaterThanOrEqual(0);
    expect(radarBounds.y).toBeGreaterThanOrEqual(0);
    expect(radarBounds.x + radarBounds.width).toBeLessThanOrEqual(viewport.width);
    expect(radarBounds.y + radarBounds.height).toBeLessThanOrEqual(hudBounds.y);
  }

  await expect(canvas).toHaveCount(1);
  await display.setViewportSize({ width: 1280, height: 720 });
}

async function assertFullscreenHud(display: Page): Promise<void> {
  const viewport = display.viewportSize();
  if (viewport === null) throw new Error("Display viewport is unavailable.");
  const worldBounds = await display.getByTestId("spaceship-world").boundingBox();
  const hudBounds = await display.locator(".spaceship-hud").boundingBox();
  if (worldBounds === null || hudBounds === null) throw new Error("Battlefield HUD has no bounds.");
  expect(Math.round(worldBounds.width)).toBe(viewport.width);
  expect(Math.round(worldBounds.height)).toBe(viewport.height);
  expect(hudBounds.x).toBeGreaterThanOrEqual(0);
  expect(hudBounds.y).toBeGreaterThanOrEqual(0);
  expect(hudBounds.x + hudBounds.width).toBeLessThanOrEqual(viewport.width);
  expect(hudBounds.y + hudBounds.height).toBeLessThanOrEqual(viewport.height);
}

async function assertSpaceshipInsideCircularArena(world: Locator): Promise<void> {
  const [worldWidth, worldHeight, arenaRadius, x, y, spaceshipRadius] = await Promise.all([
    readNumericAttribute(world, "data-world-width"),
    readNumericAttribute(world, "data-world-height"),
    readNumericAttribute(world, "data-arena-radius"),
    readNumericAttribute(world, "data-spaceship-x"),
    readNumericAttribute(world, "data-spaceship-y"),
    readNumericAttribute(world, "data-spaceship-radius")
  ]);
  const distanceFromCenter = Math.hypot(x - worldWidth / 2, y - worldHeight / 2);
  expect(distanceFromCenter + spaceshipRadius).toBeLessThanOrEqual(arenaRadius + 0.001);
}

async function readNumericAttribute(locator: Locator, attribute: string): Promise<number> {
  const rawValue = await locator.getAttribute(attribute);
  const value = rawValue === null ? Number.NaN : Number(rawValue);
  if (!Number.isFinite(value)) throw new Error(`Missing numeric attribute ${attribute}.`);
  return value;
}

async function dragTouchRight(stick: Locator, page: Page): Promise<void> {
  const bounds = await stick.boundingBox();
  if (bounds === null) throw new Error("Mobile virtual stick has no bounds.");
  const session = await page.context().newCDPSession(page);
  const start = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  const end = { x: bounds.x + bounds.width * 0.88, y: start.y };
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ ...start, id: 1 }]
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ ...end, id: 1 }]
  });
  await page.waitForTimeout(450);
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await session.detach();
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
  expectConnected = true,
  contextOptions?: Parameters<Browser["newContext"]>[0]
): Promise<Page> {
  const context = await browser.newContext(contextOptions);
  contexts.push(context);
  const page = await context.newPage();
  await page.goto(`${controllerUrl}/?room=${encodeURIComponent(roomCode)}`);
  await page.getByLabel("Имя").fill(name);
  await page.getByRole("button", { name: "Подключиться" }).click();
  if (expectConnected) await expect(page.locator(".connection")).toHaveText("В сети");
  return page;
}

async function markCrewReady(pages: readonly Page[]): Promise<void> {
  for (const [index, page] of pages.entries()) {
    await page.getByRole("button", { name: "Я готов" }).click();
    if (index < pages.length - 1) {
      await expect(page.getByRole("button", { name: "Готов — ждём экипаж" })).toBeDisabled();
    } else {
      await expect(page.getByRole("button", { name: "Я готов" })).toHaveCount(0);
    }
  }
}
