import type Phaser from "phaser";

/**
 * The reference prototype's tanks and its arena floor, drawn here so the two
 * pictures can be compared without switching projects.
 *
 * Shapes, palette and proportions are copied from `net-lab/src/TankScene.ts`
 * (`createTextures` and `drawArena`) rather than re-invented: the point of
 * having them here is that they are the same picture, so anything that looks
 * different is our doing.
 *
 * Every function draws around the origin at a nominal size and the caller
 * scales the image, because that is how the prototype does it too - its art is
 * baked once at a fixed size and each tank is scaled by its own radius.
 */

/** Half-extents the prototype's own art was drawn against. */
export const TANK_ART_HALF = 48;
export const ENEMY_ART_HALF = 42;

/**
 * The player's hull: two tracks, a rounded body, a hatch and a nose wedge.
 *
 * Drawn from the middle rather than from a corner - the prototype draws into a
 * 100x80 texture and centres it afterwards, and centring here is what lets the
 * image turn about the hull instead of about a corner.
 */
export function drawTankHull(graphics: Phaser.GameObjects.Graphics): void {
  graphics.fillStyle(0x263039, 1);
  graphics.fillRoundedRect(-43, -35, 76, 18, 5);
  graphics.fillRoundedRect(-43, 17, 76, 18, 5);
  graphics.fillStyle(0x648558, 1);
  graphics.fillRoundedRect(-38, -26, 62, 52, 8);
  graphics.fillStyle(0x55724d, 1);
  graphics.fillCircle(-1, 0, 19);
  graphics.fillStyle(0x9abb83, 1);
  graphics.fillTriangle(24, -22, 44, 0, 24, 22);
}

/**
 * The player's barrel, drawn about the mantlet rather than about the middle of
 * the sprite: the prototype sets the image's origin to 0.32 across so the gun
 * turns where it is mounted, and the same offset is baked in here.
 */
export function drawTankTurret(graphics: Phaser.GameObjects.Graphics): void {
  graphics.fillStyle(0x354230, 1);
  graphics.fillRoundedRect(-2, -5, 62, 10, 4);
  graphics.fillStyle(0x789d68, 1);
  graphics.fillCircle(-1, 0, 19);
  graphics.lineStyle(3, 0xe2f4d8, 0.75);
  graphics.strokeCircle(-1, 0, 19);
  graphics.fillStyle(0xc5d6a8, 1);
  graphics.fillTriangle(55, -7, 67, 0, 55, 7);
}

/** The swarm's hull, in the prototype's red. */
export function drawEnemyTank(graphics: Phaser.GameObjects.Graphics): void {
  graphics.fillStyle(0x2a2528, 1);
  graphics.fillRoundedRect(-38, -29, 67, 15, 4);
  graphics.fillRoundedRect(-38, 14, 67, 15, 4);
  graphics.fillStyle(0x8b4d4b, 1);
  graphics.fillRoundedRect(-33, -22, 56, 44, 7);
  graphics.fillStyle(0xd18a83, 1);
  graphics.fillTriangle(22, -18, 40, 0, 22, 18);
  // The prototype carries the enemy's barrel on a second sprite because its
  // turret traverses; ours has one drawing per enemy, so the barrel is drawn
  // into the hull along the nose.
  graphics.fillStyle(0x4a2f30, 1);
  graphics.fillRoundedRect(0, -4, 44, 8, 3);
  graphics.fillStyle(0xab625e, 1);
  graphics.fillCircle(0, 0, 15);
  graphics.lineStyle(2, 0xf0c4bf, 0.7);
  graphics.strokeCircle(0, 0, 15);
}

/**
 * The prototype's floor: a disc, a red rim, three range rings, sixteen spokes,
 * a square grid clipped to the circle by geometry, and a cross at the middle.
 *
 * `radius` is the arena's own, and every distance below is a fraction of it -
 * the prototype's arena is twice ours across, so copying its numbers rather
 * than its proportions would put the outer ring outside the wall.
 */
export function drawTankArena(
  graphics: Phaser.GameObjects.Graphics,
  radius: number,
  /**
   * How much the finished image is stretched by, so a line can be drawn thin
   * enough to come back at the width it is written as. One when the drawing is
   * shown at the size it was drawn.
   */
  lineScale = 1
): void {
  graphics.fillStyle(0x10181b, 1);
  graphics.fillCircle(0, 0, radius);

  graphics.lineStyle(3 * lineScale, 0x41545b, 0.65);
  for (const share of [0.25, 0.5, 0.75]) graphics.strokeCircle(0, 0, radius * share);

  graphics.lineStyle(2 * lineScale, 0x35464c, 0.48);
  for (let index = 0; index < 16; index += 1) {
    const angle = (index / 16) * Math.PI * 2;
    graphics.lineBetween(
      Math.cos(angle) * radius * 0.036,
      Math.sin(angle) * radius * 0.036,
      Math.cos(angle) * radius,
      Math.sin(angle) * radius
    );
  }

  // A square mesh, clipped to the disc by half-chord rather than by a mask:
  // eleven cells to the wall, which is the prototype's density on its own
  // arena.
  graphics.lineStyle(1 * lineScale, 0x2c3c41, 0.36);
  const step = radius / 5.5;
  for (let x = -radius; x <= radius; x += step) {
    const half = Math.sqrt(Math.max(0, radius * radius - x * x));
    graphics.lineBetween(x, -half, x, half);
  }
  for (let y = -radius; y <= radius; y += step) {
    const half = Math.sqrt(Math.max(0, radius * radius - y * y));
    graphics.lineBetween(-half, y, half, y);
  }

  graphics.fillStyle(0x9fb2b8, 0.8);
  graphics.fillCircle(0, 0, radius * 0.0055);
  graphics.lineStyle(4 * lineScale, 0x9fb2b8, 0.8);
  graphics.lineBetween(-radius * 0.036, 0, radius * 0.036, 0);
  graphics.lineBetween(0, -radius * 0.036, 0, radius * 0.036);
}

/** The wall, on its own image so the obstacles can sit under it. */
export function drawTankArenaRim(
  graphics: Phaser.GameObjects.Graphics,
  radius: number,
  lineScale = 1
): void {
  graphics.lineStyle(10 * lineScale, 0x8f4a48, 0.9);
  graphics.strokeCircle(0, 0, radius);
}

/** Outside the wall, which the prototype paints and never draws on again. */
export const TANK_VOID_COLOR = 0x070a0d;

/**
 * Whether the scene is drawn as the prototype draws it.
 *
 * A flag in the address rather than a switch on the panel, and off by default:
 * this is an instrument for comparing the two pictures, not a second art
 * direction. The catalogue's silhouettes, the parallax and the nebula are all
 * still there and still what a player sees - `?tanks=1` puts the prototype's
 * arena, hulls and empty sky on the screen instead, so anything that looks or
 * feels different between the two projects is ours rather than the art's.
 */
export function readTankLook(search: string): boolean {
  return new URLSearchParams(search).get("tanks") === "1";
}
