import type { DisplayGameSnapshot } from "@town-defenders/protocol";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FlyingCastleCanvas } from "./FlyingCastleCanvas.js";

const game: DisplayGameSnapshot = {
  tick: 1,
  elapsedMs: 50,
  worldWidth: 2400,
  worldHeight: 1600,
  castle: { x: 1216, y: 800, velocityX: 320, velocityY: 0, radius: 52 },
  turretAngle: 0,
  shield: { angle: Math.PI, active: true, energy: 75, capacity: 100 },
  obstacles: [],
  projectiles: [
    { projectileId: "projectile-0", x: 1280, y: 800, velocityX: 720, velocityY: 0, radius: 8 }
  ]
};

describe("FlyingCastleCanvas", () => {
  it("publishes observable authoritative state around the lazy Phaser host", () => {
    const markup = renderToStaticMarkup(<FlyingCastleCanvas game={game} connectionEpoch={0} />);
    expect(markup).toContain('data-castle-x="1216"');
    expect(markup).toContain('data-projectile-count="1"');
    expect(markup).toContain('data-shield-active="true"');
    expect(markup).toContain('data-shield-energy="75"');
  });
});
