import { expect, test, type Page } from "@playwright/test";

const configuredTestHost = process.env.E2E_HOST?.trim();
const testHost =
  configuredTestHost === undefined || configuredTestHost.length === 0
    ? "127.0.0.1"
    : configuredTestHost;
const expectedJoinHost = process.env.E2E_EXPECT_JOIN_HOST?.trim();
const displayUrl = `http://${testHost}:5173`;
const controllerUrl = `http://${testHost}:5174`;

test("display and two browser controllers complete the lobby flow", async ({ browser }) => {
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
    await expect(first.getByRole("button", { name: "Сигнал" })).toBeVisible();
    await expect(second.getByRole("button", { name: "Сигнал" })).toBeVisible();

    await first.getByRole("button", { name: "Сигнал" }).click();
    await expect(first.locator(".counter strong")).toHaveText("1");
    await expect(
      display.locator(".player-slot").filter({ hasText: "Алекс" }).locator("b")
    ).toHaveText("1");

    await first.reload();
    await expect(first.locator(".connection")).toHaveText("В сети");
    await expect(first.locator(".counter strong")).toHaveText("1");

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

async function joinController(page: Page, roomCode: string, playerName: string): Promise<void> {
  await page.goto(`${controllerUrl}/?room=${encodeURIComponent(roomCode)}`);
  await page.getByLabel("Имя").fill(playerName);
  await page.getByRole("button", { name: "Подключиться" }).click();
  await expect(page.locator(".connection")).toHaveText("В сети");
}
