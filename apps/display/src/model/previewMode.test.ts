import { displayRoomViewSchema } from "@spaceship-defender/protocol";
import { describe, expect, it } from "vitest";

import { PREVIEW_PHASES } from "@spaceship-defender/client-shared";
import { createPreviewRoomView } from "./previewMode.js";

describe("createPreviewRoomView", () => {
  it("produces a view the protocol accepts for every phase", () => {
    for (const phase of PREVIEW_PHASES) {
      const result = displayRoomViewSchema.safeParse(createPreviewRoomView(phase));
      expect(result.error?.issues ?? [], phase).toEqual([]);
    }
  });

  it("keeps the lobby projection empty as the protocol requires", () => {
    const view = createPreviewRoomView("lobby");

    expect(view.runNumber).toBe(0);
    expect(view.game).toBeNull();
  });

  it("fills the combat frame with entities for the Phaser scene", () => {
    const game = createPreviewRoomView("combat").game;

    // Two ordinary enemies and the boss, so the boss bar has something to name.
    expect(game?.enemyShips).toHaveLength(3);
    expect(game?.enemyCatalogue.filter((entry) => entry.isBoss)).toHaveLength(1);
    // One rock of each origin, so the preview shows both radar looks at once.
    expect(game?.asteroids.map((asteroid) => asteroid.origin)).toEqual(["wave", "ambient"]);
    expect(game?.friendlyProjectiles.map((projectile) => projectile.source)).toEqual([
      "cannon",
      "machineGun"
    ]);
    expect(game?.homingMissiles).toHaveLength(1);
  });

  it("publishes no dynamic entities during the intermission", () => {
    const game = createPreviewRoomView("intermission").game;

    expect(game?.enemyShips).toHaveLength(0);
    expect(game?.hostileProjectiles).toHaveLength(0);
    expect(game?.teamUpgrade.offer).not.toBeNull();
  });
});
