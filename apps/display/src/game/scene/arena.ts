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

/**
 * The same drawing, sized to the field it is stretched across.
 *
 * The floor is one texture however wide the arena is, so nothing here can meet
 * a GPU's texture ceiling - what it meets is its own resolution. At a
 * four-thousand-unit arena a texel is two units and the rim's thin rings read;
 * on a field ten times wider the same texture puts twenty units in a texel and
 * they turn to mush. So a large field earns a larger bake, and only a large
 * field pays for it: four thousand and ninety-six a side is four times the
 * video memory, which a phone drawing a small arena has no reason to spend.
 */
function arenaTextureSide(diameter: number): number {
  return diameter > 12_000 ? 4096 : ARENA_TEXTURE_SIDE;
}

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
  const side = arenaTextureSide(diameter);
  const scale = side / diameter;

  if (tankLook) {
    scene.cameras.main.setBackgroundColor(TANK_VOID_COLOR);
    const floor = bake(`tankArena:floor:${String(Math.round(radius))}`, side / 2, (graphics) => {
      drawTankArena(graphics, radius * scale, scale);
    });
    scene.add.image(centerX, centerY, floor).setDisplaySize(diameter, diameter).setDepth(0);
    const rim = bake(`tankArena:rim:${String(Math.round(radius))}`, side / 2, (graphics) => {
      drawTankArenaRim(graphics, radius * scale, scale);
    });
    scene.add.image(centerX, centerY, rim).setDisplaySize(diameter, diameter).setDepth(3);
    return;
  }

  scene.cameras.main.setBackgroundColor(OUTSIDE_SPACE_COLOR);

  const band = getRimBandStroke(radius, snapshot.rimBandWidth);

  const floorKey = bake(
    `arena:floor:${String(Math.round(radius))}:${String(Math.round(snapshot.rimBandWidth))}`,
    side / 2,
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

  drawBorder(scene, centerX, centerY, radius, bake);
}

/** The rim line, in world units, and the colour it has always been drawn in. */
const BORDER_WIDTH = 8;
const BORDER_COLOR = 0x3d6874;
/** How long one straight piece of the rim is; at a 4400 radius it bows under 1.2 units. */
const BORDER_PIECE_LENGTH = 200;

/**
 * The rim, as a ring of short straight pieces rather than one picture of a circle.
 *
 * Its own layer rather than part of the floor: the rim has to stay above the
 * obstacles, and they sit between the two. It used to be that layer as a whole
 * texture the size of the arena, which made the GPU blend a full-screen quad
 * every frame to show a line eight units wide - on a Redmi 4X each full-screen
 * translucent layer measured at about five frames a second, and swapping the
 * texture for a 1x1 one saved almost none of it, so the cost was the covered
 * area and not the picture. The pieces share one tiny texture and stand in a
 * row, so they batch into a single draw, and the GPU fills only the line.
 */
function drawBorder(
  scene: Phaser.Scene,
  centerX: number,
  centerY: number,
  radius: number,
  bake: BakeShape
): void {
  const piece = bake("arena:border:piece", 2, (graphics) => {
    graphics.fillStyle(BORDER_COLOR, 1);
    graphics.fillRect(-2, -2, 4, 4);
  });
  const count = Math.max(64, Math.ceil((2 * Math.PI * radius) / BORDER_PIECE_LENGTH));
  const step = (Math.PI * 2) / count;
  // A chord, plus a little, so neighbouring pieces overlap instead of leaving a
  // hairline at every joint on the outside of the curve.
  const length = 2 * radius * Math.sin(step / 2) + BORDER_WIDTH;
  for (let index = 0; index < count; index += 1) {
    const angle = (index + 0.5) * step;
    scene.add
      .image(centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius, piece)
      .setDisplaySize(length, BORDER_WIDTH)
      .setRotation(angle + Math.PI / 2)
      .setDepth(3);
  }
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

/** How many pixels one cell of the sheet is baked at, before it is scaled. */
const ZONE_CELL_SIDE = 128;

/**
 * The closing field, as one image per rectangle.
 *
 * It used to be a single texture of the whole sheet, rebaked every time any
 * rectangle changed state: on a field of nineteen thousand units that is a
 * four-thousand-pixel square canvas, eighty-eight rectangles drawn into it and
 * an upload to the GPU - half a second of frozen game, every closure, in the
 * exact moment the player most needs to see where the wall is.
 *
 * The grid is uniform, so two small textures - one amber cell, one red - cover
 * every rectangle there will ever be. A state change is then swapping a texture
 * on one image, which costs nothing, and the frame that used to freeze draws
 * eighty-eight static images like any other ground.
 */
export class ArenaZoneLayer {
  private readonly cells = new Map<number, Phaser.GameObjects.Image>();

  sync(scene: Phaser.Scene, snapshot: DisplayGameSnapshot, bake: BakeShape): void {
    const warning = bake(`arena:zone:warning`, ZONE_CELL_SIDE / 2, (graphics) => {
      drawCell(graphics, ZONE_WARNING_COLOR, ZONE_WARNING_ALPHA, 0.7);
    });
    const closed = bake(`arena:zone:closed`, ZONE_CELL_SIDE / 2, (graphics) => {
      drawCell(graphics, ZONE_CLOSED_COLOR, ZONE_CLOSED_ALPHA, 0.5);
    });

    const seen = new Set<number>();
    for (const zone of snapshot.arenaZones) {
      if (zone.state === "safe") continue;
      seen.add(zone.zoneId);
      const key = zone.state === "closed" ? closed : warning;
      const middleX = zone.x + zone.width / 2;
      const middleY = zone.y + zone.height / 2;
      const existing = this.cells.get(zone.zoneId);
      if (existing === undefined) {
        // Over the floor, under everything that moves: it is ground.
        this.cells.set(
          zone.zoneId,
          scene.add.image(middleX, middleY, key).setDisplaySize(zone.width, zone.height).setDepth(1)
        );
        continue;
      }
      if (existing.texture.key !== key)
        existing.setTexture(key).setDisplaySize(zone.width, zone.height);
    }

    for (const [id, cell] of this.cells) {
      if (seen.has(id)) continue;
      cell.destroy();
      this.cells.delete(id);
    }
  }

  destroy(): void {
    for (const cell of this.cells.values()) cell.destroy();
    this.cells.clear();
  }
}

/** One cell of the sheet, drawn once at its own size and scaled to every zone. */
function drawCell(
  graphics: Phaser.GameObjects.Graphics,
  colour: number,
  alpha: number,
  edgeAlpha: number
): void {
  const half = ZONE_CELL_SIDE / 2;
  graphics.fillStyle(colour, alpha);
  graphics.fillRect(-half, -half, ZONE_CELL_SIDE, ZONE_CELL_SIDE);
  graphics.lineStyle(2, colour, edgeAlpha);
  graphics.strokeRect(-half + 1, -half + 1, ZONE_CELL_SIDE - 2, ZONE_CELL_SIDE - 2);
}
