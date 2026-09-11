import type Phaser from "phaser";
import type { DisplayGameSnapshot } from "@spaceship-defender/protocol";

import { bakeRect } from "../bake.js";
import { getArenaRingRadii, getArenaSpokes, getRimBandStroke } from "../spaceshipViewModel.js";
import { drawTankArena, drawTankArenaRim, TANK_VOID_COLOR } from "../tankArt.js";

/**
 * Side of the baked arena floor, in texture pixels.
 *
 * Sixteen megabytes of video memory for a drawing that would otherwise be
 * rebuilt every frame. Halving it would blur the two-unit rings past reading
 * once the image is stretched to four thousand units; doubling it buys nothing
 * the camera can show. Line widths drawn inside it are divided by that stretch,
 * or they arrive as many times too thick.
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

/**
 * The floor, baked once instead of re-tessellated sixty times a second.
 *
 * A profile of a throttled fight put Phaser's graphics renderer, its batcher
 * and the polygon tessellator at two thirds of the main thread, and the arena
 * is the largest single drawing on the field: a filled circle four thousand
 * units across, a rim band, five rings and twelve spokes, every command of it
 * walked again on every frame because that is what a `Graphics` object is.
 *
 * As a texture it is four vertices. The bake happens in texture space and the
 * image is stretched back to world size, which is why every width below is
 * multiplied: a two-unit ring drawn at texture scale comes back two units
 * wide on the floor. Curves and flat fills carry that stretch without
 * showing it; that is the whole reason this shape can be baked and the shield
 * cannot.
 */
/**
 * The floor. Ours by default, the prototype's under `?tanks=1`.
 *
 * Both are baked at a fixed resolution and stretched to the arena, and both
 * divide their line widths by that stretch: an image drawn at two thousand
 * pixels and shown at four thousand units returns a line twice as thick as it
 * was written.
 */
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

/** Faint red for ground that is already killing, amber for ground about to. */
const ZONE_CLOSED_COLOR = 0xb03a3a;
const ZONE_CLOSED_ALPHA = 0.16;
const ZONE_WARNING_COLOR = 0xe6b85c;
/*
 * Brighter than the ground that is already killing, not fainter.
 *
 * The warning is the one a player has to act on - the red is a fact, the amber
 * is a deadline - and at a tenth it was the harder of the two to notice, which
 * is what "no new amber zones appear" looked like from the cockpit.
 */
const ZONE_WARNING_ALPHA = 0.24;

/**
 * The arena's sheet of zones, drawn once per change.
 *
 * Baked rather than drawn, like everything else on this floor: the sheet moves
 * a handful of times in a match, and a `Graphics` would be re-walked on every
 * one of the sixty frames between. The texture key carries the states, so the
 * bake is reused until a zone actually changes - which is the same reason the
 * server only republishes the sheet when its signature moves.
 *
 * Deliberately faint. On the shared screen the fight has to stay readable
 * through it; the console draws the same sheet at full strength, because there
 * the sheet *is* the subject.
 */
export function arenaZoneSignature(snapshot: DisplayGameSnapshot): string {
  return snapshot.arenaZones.map((zone) => zone.state.charAt(0)).join("");
}

export function drawArenaZones(
  scene: Phaser.Scene,
  snapshot: DisplayGameSnapshot,
  bake: BakeShape
): Phaser.GameObjects.Image | undefined {
  const zones = snapshot.arenaZones;
  if (zones.length === 0) return undefined;

  const centerX = snapshot.worldWidth / 2;
  const centerY = snapshot.worldHeight / 2;
  const radius = snapshot.arenaRadius;
  const diameter = radius * 2;
  const scale = ARENA_TEXTURE_SIDE / diameter;
  const signature = arenaZoneSignature(snapshot);

  const key = bake(
    `arena:zones:${String(Math.round(radius))}:${signature}`,
    ARENA_TEXTURE_SIDE / 2,
    (graphics) => {
      for (const zone of zones) {
        if (zone.state === "safe") continue;
        const closed = zone.state === "closed";
        graphics.fillStyle(
          closed ? ZONE_CLOSED_COLOR : ZONE_WARNING_COLOR,
          closed ? ZONE_CLOSED_ALPHA : ZONE_WARNING_ALPHA
        );
        graphics.fillRect(
          (zone.x - centerX) * scale,
          (zone.y - centerY) * scale,
          zone.width * scale,
          zone.height * scale
        );
        graphics.lineStyle(2, closed ? ZONE_CLOSED_COLOR : ZONE_WARNING_COLOR, closed ? 0.5 : 0.7);
        graphics.strokeRect(
          (zone.x - centerX) * scale,
          (zone.y - centerY) * scale,
          zone.width * scale,
          zone.height * scale
        );
      }
    }
  );

  // Over the floor, under everything that moves: it is ground, not an entity.
  return scene.add.image(centerX, centerY, key).setDisplaySize(diameter, diameter).setDepth(1);
}
