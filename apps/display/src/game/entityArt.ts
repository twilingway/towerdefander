import type Phaser from "phaser";
import {
  FALLBACK_VISUAL_ASSET_ID,
  getVisualAsset,
  type DisplayGameSnapshot,
  type PublicEnemyCatalogueEntry,
  type PublicEnemyView
} from "@spaceship-defender/protocol";

import { bakeRect } from "./bake.js";
import { drawCatalogAsset, drawCatalogAssetById } from "./catalogRenderer.js";

/** The hull a ship falls back to when the preset names none. */
const DEFAULT_SPACESHIP_HULL_ASSET_ID = "ship-dart";

const FALLBACK_ENEMY_VISUAL: PublicEnemyCatalogueEntry = {
  kind: "unknown",
  label: "Unknown",
  shape: FALLBACK_VISUAL_ASSET_ID,
  modelScale: 1,
  showHealthBar: false,
  isBoss: false
};

/** An archetype the display has no entry for still gets drawn, just generically. */
export function resolveEnemyVisual(
  catalogue: readonly PublicEnemyCatalogueEntry[],
  kind: string
): PublicEnemyCatalogueEntry {
  return catalogue.find((entry) => entry.kind === kind) ?? FALLBACK_ENEMY_VISUAL;
}

/**
 * Where the weapon is bolted, in world space. The mount is written in the
 * hull's frame, so it has to turn with the hull: a gun put on the left wing
 * stays on the left wing however the ship is pointing.
 */
export function turretMountPoint(
  ship: { readonly x: number; readonly y: number; readonly radius: number },
  heading: number,
  visual: { readonly mountX: number; readonly mountY: number } | null
): { x: number; y: number } {
  if (visual === null) return { x: ship.x, y: ship.y };
  const offsetX = visual.mountX * ship.radius;
  const offsetY = visual.mountY * ship.radius;
  const cos = Math.cos(heading);
  const sin = Math.sin(heading);
  return {
    x: ship.x + offsetX * cos - offsetY * sin,
    y: ship.y + offsetX * sin + offsetY * cos
  };
}

export function drawSpaceshipHull(
  body: Phaser.GameObjects.Graphics,
  snapshot: Pick<DisplayGameSnapshot, "spaceship" | "spaceshipVisual">
): void {
  const visual = snapshot.spaceshipVisual;
  const asset = getVisualAsset(visual?.shape ?? DEFAULT_SPACESHIP_HULL_ASSET_ID);
  drawCatalogAsset(body, asset, snapshot.spaceship.radius * (visual?.modelScale ?? 1));
}

export function drawEnemyBody(
  body: Phaser.GameObjects.Graphics,
  visual: PublicEnemyCatalogueEntry,
  radius: number
): void {
  // The hitbox stays at radius; only the drawn model takes the scale. The id
  // comes from untrusted preset data, so an unknown one still draws.
  drawCatalogAssetById(body, visual.shape, radius * visual.modelScale);
}

const HEALTH_BAR_BACKGROUND = 0x2a0d16;
const HEALTH_BAR_FILL = 0xff5f7a;

/** Where a bar sits and how big it is, from the hull it belongs to. */
export function healthBarBox(entity: Pick<PublicEnemyView, "radius">): {
  readonly width: number;
  readonly height: number;
  readonly top: number;
} {
  const height = Math.max(5, entity.radius * 0.12);
  return { width: entity.radius * 1.8, height, top: -entity.radius - height * 2.4 };
}

export function healthBarFraction(entity: Pick<PublicEnemyView, "hp" | "maxHp">): number {
  if (!Number.isFinite(entity.maxHp) || entity.maxHp <= 0) return 0;
  return Math.max(0, Math.min(1, entity.hp / entity.maxHp));
}

/**
 * Two images rather than a drawing, for the same reason as everything else on
 * the field.
 *
 * A wave is thirty hulls, and a `Graphics` bar on each of them is thirty
 * objects re-walked and re-batched every frame whether or not anyone took
 * damage - which is what a profile of a real wave found still standing after
 * the arena and the hulls were baked. The frame is one texture, the fill is
 * another, and a hit only changes how wide the second one is drawn.
 */
export function createEnemyHealthBar(
  scene: Phaser.Scene,
  entity: PublicEnemyView
): Phaser.GameObjects.Container {
  const { width, height, top } = healthBarBox(entity);
  const size = `${String(Math.round(width))}x${String(Math.round(height))}`;
  const frame = scene.add
    .image(
      0,
      top,
      bakeRect(scene, `hpframe:${size}`, width, height, (graphics) => {
        graphics.fillStyle(HEALTH_BAR_BACKGROUND, 0.85);
        graphics.fillRect(0, 0, width, height);
        graphics.lineStyle(2, 0xffd1b0, 0.7);
        graphics.strokeRect(1, 1, width - 2, height - 2);
      })
    )
    .setOrigin(0.5, 0);
  const fill = scene.add
    .image(
      -width / 2,
      top,
      bakeRect(scene, `hpfill:${size}`, width, height, (graphics) => {
        graphics.fillStyle(HEALTH_BAR_FILL, 1);
        graphics.fillRect(0, 0, width, height);
      })
    )
    .setOrigin(0, 0);
  const bar = scene.add.container(0, 0, [frame, fill]);
  bar.setData("fill", fill);
  setEnemyHealthBar(bar, entity);
  return bar;
}

/** A hit only moves the right edge of the fill; nothing is drawn again. */
export function setEnemyHealthBar(
  bar: Phaser.GameObjects.Container,
  entity: PublicEnemyView
): void {
  const fill = bar.getData("fill") as Phaser.GameObjects.Image | undefined;
  if (fill === undefined) return;
  const { width, height } = healthBarBox(entity);
  fill.setDisplaySize(width * healthBarFraction(entity), height);
}
