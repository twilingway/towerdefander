import type { Page } from "@playwright/test";

/**
 * From the mode grid to an open campaign room.
 *
 * The display starts on the two-tile front door now, and the campaign setup
 * behind it defaults to solo on this very screen. A spec that wants a crew with
 * phones therefore has to say so - which is the point of asking for the size
 * here rather than relying on whatever the screen happens to open on.
 */
export async function openCampaign(display: Page, crewSize: 1 | 2 | 3): Promise<void> {
  await display.getByRole("button", { name: "Кампания I: Завеса" }).click();
  await display
    .getByRole("button", { name: crewSize === 1 ? "1 игрок" : `${String(crewSize)} игрока` })
    .click();
  await display.getByRole("button", { name: "В бой" }).click();
}
