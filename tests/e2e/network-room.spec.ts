import { expect, test, type Locator, type Page } from "@playwright/test";

const configuredTestHost = process.env.E2E_HOST?.trim();
const testHost =
  configuredTestHost === undefined || configuredTestHost.length === 0
    ? "127.0.0.1"
    : configuredTestHost;
const expectedJoinHost = process.env.E2E_EXPECT_JOIN_HOST?.trim();
const displayUrl = process.env.E2E_DISPLAY_URL ?? `http://${testHost}:5173`;
const controllerUrl = process.env.E2E_CONTROLLER_URL ?? `http://${testHost}:5174`;

test("display and two browser controllers complete a deterministic defense match", async ({
  browser
}) => {
  test.setTimeout(50_000);
  const displayContext = await browser.newContext();
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  const thirdContext = await browser.newContext();
  const unknownRoomContext = await browser.newContext();

  try {
    const display = await displayContext.newPage();
    await display.goto(displayUrl);
    await display.getByRole("button", { name: "Создать комнату" }).click();

    const roomCodeElement = display.locator(".room-code");
    await expect(roomCodeElement).toBeVisible();
    const roomCode = (await roomCodeElement.textContent())?.trim();
    if (roomCode === undefined || roomCode.length === 0) {
      throw new Error("Display did not publish a room code.");
    }
    await expect(display.locator(".join-card svg")).toBeVisible();
    if (expectedJoinHost !== undefined) {
      const joinHref = await display.locator(".join-card a").getAttribute("href");
      if (joinHref === null) {
        throw new Error("Display did not publish a controller join URL.");
      }
      expect(new URL(joinHref).hostname).toBe(expectedJoinHost);
    }

    const first = await firstContext.newPage();
    const second = await secondContext.newPage();
    await Promise.all([
      joinController(first, roomCode, "Алекс"),
      joinController(second, roomCode, "Сэм")
    ]);

    await expect(display.locator(".players-card")).toContainText("Алекс");
    await expect(display.locator(".players-card")).toContainText("Сэм");

    await first.getByRole("button", { name: "Я готов" }).click();
    await second.getByRole("button", { name: "Я готов" }).click();

    await expect(display.locator(".phase-badge")).toHaveText("Раунд начался");
    await expect(first.getByRole("button", { name: /Улучшить/ })).toBeVisible();
    await expect(second.getByRole("button", { name: /Ремонт/ })).toBeVisible();
    await expect(display.getByTestId("battlefield-canvas")).toBeVisible();
    await expect(display.locator(".battlefield-canvas canvas")).toBeVisible();
    await expect(display.getByTestId("battlefield-canvas")).toHaveAttribute(
      "data-environment-state",
      "ready"
    );
    await expect(display.locator(".sector-status-strip > div")).toHaveCount(2);
    await expect
      .poll(
        async () =>
          Number(
            (await display.locator(".battlefield-shell").getAttribute("data-enemy-count")) ?? 0
          ),
        { timeout: 10_000 }
      )
      .toBeGreaterThan(0);
    await display.setViewportSize({ width: 1_600, height: 900 });
    const battlefieldBounds = await display.locator(".battlefield-canvas canvas").boundingBox();
    expect(battlefieldBounds?.width).toBeGreaterThan(0);
    expect(battlefieldBounds?.height).toBeGreaterThan(0);

    await second.getByRole("button", { name: /Ремонт/ }).click();
    await expect(second.locator(".error-message")).toHaveText("Сейчас это действие недоступно.");

    await first.getByRole("button", { name: /Улучшить/ }).click();
    await expect(first.locator(".sector-summary").filter({ hasText: "Защита" })).toContainText(
      "ур. 2"
    );
    await expect(
      display.locator(".sector-status-strip > div").filter({ hasText: "Алекс" })
    ).toContainText("Башня ур. 2");
    await first.getByRole("button", { name: /Улучшить/ }).click();
    await expect(first.locator(".sector-summary")).toContainText("ур. 3");

    await first.reload();
    await expect(first.locator(".connection")).toHaveText("В сети");
    await expect(first.locator(".sector-summary")).toContainText("ур. 3");

    const third = await thirdContext.newPage();
    await third.goto(`${controllerUrl}/?room=${encodeURIComponent(roomCode)}`);
    await third.getByLabel("Имя").fill("Третий");
    await third.getByRole("button", { name: "Подключиться" }).click();
    await expect(third.locator(".error-message")).toHaveText("В комнате уже два игрока.");

    const unknownRoom = await unknownRoomContext.newPage();
    await unknownRoom.goto(`${controllerUrl}/?room=missing-room`);
    await unknownRoom.getByLabel("Имя").fill("Заблудившийся");
    await unknownRoom.getByRole("button", { name: "Подключиться" }).click();
    await expect(unknownRoom.locator(".error-message")).toHaveText(
      "Комната не найдена. Проверьте код."
    );
    await unknownRoom.getByLabel("Код комнаты").fill(roomCode);
    await expect(unknownRoom.getByLabel("Код комнаты")).toHaveValue(roomCode);

    const cooperativeAirstrike = first.getByRole("button", { name: "Помочь соседу" });
    await expect
      .poll(
        async () => {
          if (await cooperativeAirstrike.isEnabled()) {
            await cooperativeAirstrike.click();
          }
          return display.locator(".battlefield-shell").getAttribute("data-airstrike-sequence");
        },
        { timeout: 25_000 }
      )
      .toBe("1");

    const secondGate = second
      .locator(".sector-summary div")
      .filter({ hasText: "Ворота" })
      .locator("strong");
    await expect.poll(() => readCurrentHealth(secondGate), { timeout: 25_000 }).toBeLessThan(100);
    const healthBeforeRepair = await readCurrentHealth(secondGate);
    await second.getByRole("button", { name: /Ремонт/ }).click();
    await expect
      .poll(() => readCurrentHealth(secondGate), { timeout: 5_000 })
      .toBeGreaterThan(healthBeforeRepair);

    await expect(display.locator(".battle-result")).toHaveText("Победа!", {
      timeout: 30_000
    });
  } finally {
    await Promise.all([
      displayContext.close(),
      firstContext.close(),
      secondContext.close(),
      thirdContext.close(),
      unknownRoomContext.close()
    ]);
  }
});

async function readCurrentHealth(locator: Locator): Promise<number> {
  const text = (await locator.textContent()) ?? "0";
  return Number(text.split("/")[0]?.trim() ?? "0");
}

async function joinController(page: Page, roomCode: string, playerName: string): Promise<void> {
  await page.goto(`${controllerUrl}/?room=${encodeURIComponent(roomCode)}`);
  await page.getByLabel("Имя").fill(playerName);
  await page.getByRole("button", { name: "Подключиться" }).click();
  await expect(page.locator(".connection")).toHaveText("В сети");
}
