import type { DisplayGameSnapshot } from "@spaceship-defender/protocol";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BossHealth } from "./BossHealth.js";
import { createPreviewRoomView } from "./previewMode.js";

function combat(): DisplayGameSnapshot {
  const game = createPreviewRoomView("combat").game;
  if (game === null) throw new Error("the combat fixture must carry a game");
  return game;
}

describe("BossHealth", () => {
  it("names the boss the catalogue marks and shows its authoritative health", () => {
    const markup = renderToStaticMarkup(<BossHealth game={combat()} />);

    expect(markup).toContain('data-entity-id="preview-boss"');
    expect(markup).toContain("Босс");
    expect(markup).toContain("1420 / 2000");
    expect(markup).toContain('aria-valuenow="1420"');
  });

  it("shows nothing while no boss is on the field", () => {
    const game = combat();
    const markup = renderToStaticMarkup(
      <BossHealth
        game={{ ...game, enemyShips: game.enemyShips.filter((enemy) => enemy.kind !== "boss") }}
      />
    );

    expect(markup).toBe("");
  });

  it("ignores an ordinary enemy even when it is the healthiest thing alive", () => {
    const game = combat();
    const markup = renderToStaticMarkup(
      <BossHealth
        game={{
          ...game,
          enemyCatalogue: game.enemyCatalogue.map((entry) => ({ ...entry, isBoss: false }))
        }}
      />
    );

    expect(markup).toBe("");
  });
});
