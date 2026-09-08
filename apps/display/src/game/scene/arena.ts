import type Phaser from "phaser";
import type { DisplayGameSnapshot } from "@spaceship-defender/protocol";

import { bakeRect } from "../bake.js";
import { getArenaRingRadii, getArenaSpokes, getRimBandStroke } from "../spaceshipViewModel.js";
import { drawTankArena, drawTankArenaRim, TANK_VOID_COLOR } from "../tankArt.js";

/**
 * The floor is baked at this side and stretched to the arena's diameter. A disc
 * four thousand units across would otherwise be a four-thousand-pixel texture -
 * and line widths drawn inside it have to be divided by the same stretch, or
 * they arrive that many times too thick.
 */
const ARENA_TEXTURE_SIDE = 2048;

const OUTSIDE_SPACE_COLOR = 0x02070d;
const ARENA_SPACE_COLOR = 0x07171f;
/** The elastic rim band: visible enough to read as ground, not as an object. */
const RIM_BAND_COLOR = 0xf2c14e;
const RIM_BAND_ALPHA = 0.12;
/** The disc is laid over the camera's own colour rather than replacing it. */
const ARENA_FILL_ALPHA = 0.5;

/** Bakes a drawing centred on zero and hands back its texture key. */
type BakeShape = (
  key: string,
  half: number,
  draw: (graphics: Phaser.GameObjects.Graphics) => void
) => string;

export function drawArena(
  scene: Phaser.Scene,
  snapshot: DisplayGameSnapshot,
  tankLook: boolean,
  bake: BakeShape
): void {
  const centerX = snapshot.worldWidth / 2;
  const centerY = snapshot.worldHeight / 2;
  const radius = snapshot.arenaRadius;
  const diameter = radius * 2;
  const scale = ARENA_TEXTURE_SIDE / diameter;

  if (tankLook) {
    scene.cameras.main.setBackgroundColor(TANK_VOID_COLOR);
    const floor = bake(
      `tankArena:floor:${String(Math.round(radius))}`,
      ARENA_TEXTURE_SIDE / 2,
      (graphics) => {
        drawTankArena(graphics, radius * scale, scale);
      }
    );
    scene.add.image(centerX, centerY, floor).setDisplaySize(diameter, diameter).setDepth(0);
    const rim = bake(
      `tankArena:rim:${String(Math.round(radius))}`,
      ARENA_TEXTURE_SIDE / 2,
      (graphics) => {
        drawTankArenaRim(graphics, radius * scale, scale);
      }
    );
    scene.add.image(centerX, centerY, rim).setDisplaySize(diameter, diameter).setDepth(3);
    return;
  }

  scene.cameras.main.setBackgroundColor(OUTSIDE_SPACE_COLOR);

  const band = getRimBandStroke(radius, snapshot.rimBandWidth);

  const floorKey = bake(
    `arena:floor:${String(Math.round(radius))}:${String(Math.round(snapshot.rimBandWidth))}`,
    ARENA_TEXTURE_SIDE / 2,
    (graphics) => {
      graphics.fillStyle(ARENA_SPACE_COLOR, ARENA_FILL_ALPHA);
      graphics.fillCircle(0, 0, radius * scale);
      // The band the rim slows a hull in, under the rings so those stay readable.
      if (band !== null) {
        graphics.lineStyle(band.thickness * scale, RIM_BAND_COLOR, RIM_BAND_ALPHA);
        graphics.strokeCircle(0, 0, band.radius * scale);
      }
      // Rings and spokes rather than a square grid: on a round arena what a
      // pilot reads off the floor is the distance to the rim and the bearing,
      // and a square mesh states neither.
      graphics.lineStyle(2 * scale, 0x163746, 0.75);
      for (const ringRadius of getArenaRingRadii(radius)) {
        graphics.strokeCircle(0, 0, ringRadius * scale);
      }
      graphics.lineStyle(2 * scale, 0x14303d, 0.5);
      for (const spoke of getArenaSpokes(0, 0, radius)) {
        graphics.lineBetween(
          spoke.from.x * scale,
          spoke.from.y * scale,
          spoke.to.x * scale,
          spoke.to.y * scale
        );
      }
    }
  );
  scene.add.image(centerX, centerY, floorKey).setDisplaySize(diameter, diameter).setDepth(0);

  // Its own image rather than part of the floor: the rim has to stay above
  // the obstacles, and they sit between the two.
  const borderKey = bake(
    `arena:border:${String(Math.round(radius))}`,
    ARENA_TEXTURE_SIDE / 2,
    (graphics) => {
      graphics.lineStyle(8 * scale, 0x3d6874, 1);
      graphics.strokeCircle(0, 0, radius * scale);
    }
  );
  scene.add.image(centerX, centerY, borderKey).setDisplaySize(diameter, diameter).setDepth(3);
}

/**
 * The obstacles, one image each.
 *
 * They never move and never change, and drawn into a `Graphics` they were
 * still tessellated on every frame - the rounded rectangles in particular,
 * which is a fan of triangles per corner. Baked per shape and size, a field
 * of them costs a transform apiece.
 */
export function drawDecorations(
  scene: Phaser.Scene,
  snapshot: DisplayGameSnapshot,
  bake: BakeShape
): void {
  for (const obstacle of snapshot.obstacles) {
    const fill = obstacle.kind === "circle" ? 0x305d63 : 0x435262;
    if (obstacle.kind === "circle") {
      const radius = Math.round(obstacle.radius);
      scene.add
        .image(
          obstacle.x,
          obstacle.y,
          bake(`rock:field:${String(radius)}`, radius + 6, (graphics) => {
            graphics.fillStyle(fill, 0.78);
            graphics.fillCircle(0, 0, radius);
            graphics.lineStyle(5, 0x78a4a4, 0.7);
            graphics.strokeCircle(0, 0, radius);
          })
        )
        .setDepth(2);
      continue;
    }
    const width = Math.round(obstacle.width);
    const height = Math.round(obstacle.height);
    scene.add
      .image(
        obstacle.x,
        obstacle.y,
        bakeRect(
          scene,
          `slab:${String(width)}x${String(height)}`,
          width + 8,
          height + 8,
          (graphics) => {
            graphics.fillStyle(fill, 0.78);
            graphics.fillRoundedRect(4, 4, width, height, 24);
            graphics.lineStyle(5, 0x78a4a4, 0.7);
            graphics.strokeRoundedRect(4, 4, width, height, 24);
          }
        )
      )
      .setDepth(2);
  }
}
