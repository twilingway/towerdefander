import { displayRoomViewSchema } from "@spaceship-defender/protocol";
import { describe, expect, it } from "vitest";

import { createPreviewRoomView, isPreviewMode, PREVIEW_PHASES } from "./previewMode.js";

describe("isPreviewMode", () => {
  it("opens only for a dev build asked for it", () => {
    expect(isPreviewMode("?preview=1", true)).toBe(true);
  });

  it("stays closed in a production build", () => {
    expect(isPreviewMode("?preview=1", false)).toBe(false);
  });

  it("stays closed without the parameter", () => {
    expect(isPreviewMode("", true)).toBe(false);
  });
});

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

    expect(game?.enemyShips).toHaveLength(2);
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
