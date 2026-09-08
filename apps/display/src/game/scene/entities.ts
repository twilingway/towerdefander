import type Phaser from "phaser";
import type {
  DisplayGameSnapshot,
  PublicAsteroidView,
  PublicEnemyView,
  PublicHomingMissileView,
  PublicLootDropView,
  PublicProjectileView
} from "@spaceship-defender/protocol";

import { drawCatalogAssetById } from "../catalogRenderer.js";
import { createEnemyHealthBar, drawEnemyBody, resolveEnemyVisual } from "../entityArt.js";
import { drawEnemyTank, ENEMY_ART_HALF } from "../tankArt.js";

/** Everything the field draws that is neither the ship nor the scenery. */
export type CombatEntity =
  | (PublicEnemyView & { readonly visualKind: "enemy" })
  | (PublicAsteroidView & { readonly visualKind: "asteroid" })
  | (PublicLootDropView & { readonly visualKind: "loot" })
  | (PublicProjectileView & { readonly visualKind: "projectile" })
  | (PublicHomingMissileView & { readonly visualKind: "missile" });

function getProjectileStyle(entity: PublicProjectileView): { fill: number; stroke: number } {
  if (entity.kind === "friendly" && entity.source === "machineGun") {
    return { fill: 0x5fe8d8, stroke: 0xbffcf2 };
  }
  const friendly = entity.kind === "friendly";
  return { fill: friendly ? 0xffd36f : 0xff685f, stroke: friendly ? 0xfff1b2 : 0xffc2bd };
}

function getEntityDepth(entity: CombatEntity): number {
  if (entity.visualKind === "asteroid") return 5;
  // Above the rocks so it is never lost behind one, below the ships.
  if (entity.visualKind === "loot") return 6;
  return entity.visualKind === "enemy" ? 7 : 11;
}

export function getEntityHeading(entity: CombatEntity): number {
  if ("heading" in entity) return entity.heading;
  return Math.atan2(entity.velocityY, entity.velocityX);
}

/** Bakes a drawing centred on zero and hands back its texture key. */
type BakeShape = (
  key: string,
  half: number,
  draw: (graphics: Phaser.GameObjects.Graphics) => void
) => string;

export function createCombatVisual(
  scene: Phaser.Scene,
  entity: CombatEntity,
  snapshot: DisplayGameSnapshot,
  tankLook: boolean,
  bake: BakeShape
): {
  readonly object: Phaser.GameObjects.Container;
  readonly healthBar: Phaser.GameObjects.Container | undefined;
} {
  const container = scene.add.container(entity.x, entity.y).setDepth(getEntityDepth(entity));
  let healthBar: Phaser.GameObjects.Container | undefined;
  if (entity.visualKind === "enemy") {
    const visual = resolveEnemyVisual(snapshot.enemyCatalogue, entity.kind);
    const key = `enemy:${visual.shape}:${String(visual.modelScale)}:${String(Math.round(entity.radius))}`;
    const body = scene.add
      .image(
        0,
        0,
        tankLook
          ? bake("tank:enemy", ENEMY_ART_HALF + 6, drawEnemyTank)
          : bake(key, entity.radius * visual.modelScale * 1.35 + 4, (graphics) => {
              drawEnemyBody(graphics, visual, entity.radius);
            })
      )
      .setScale(tankLook ? (entity.radius * visual.modelScale) / ENEMY_ART_HALF : 1);
    container.add(body);
    if (visual.showHealthBar) {
      healthBar = createEnemyHealthBar(scene, entity);
      container.add(healthBar);
    }
  } else if (entity.visualKind === "asteroid") {
    const asteroidVisual = snapshot.asteroidVisual;
    if (asteroidVisual !== null) {
      const size = entity.radius * asteroidVisual.modelScale;
      const rock = scene.add.image(
        0,
        0,
        bake(
          `rock:${asteroidVisual.shape}:${String(Math.round(size))}`,
          size * 1.35 + 4,
          (graphics) => {
            drawCatalogAssetById(graphics, asteroidVisual.shape, size);
          }
        )
      );
      container.add(rock);
    } else {
      // A plain rock when the preset names no art. Baked like everything
      // else: `add.circle` is a shape, and a shape goes through the same
      // graphics pipeline a drawing does - sixteen of them on the field cost
      // more than the ship, the gun and the arena together.
      const rock = scene.add.image(
        0,
        0,
        bake(`rock:plain:${String(Math.round(entity.radius))}`, entity.radius + 6, (graphics) => {
          graphics.fillStyle(0x766f77, 1);
          graphics.fillCircle(0, 0, entity.radius);
          graphics.lineStyle(4, 0xbba9a2, 1);
          graphics.strokeCircle(0, 0, entity.radius);
          graphics.fillStyle(0x514d59, 1);
          graphics.fillCircle(-entity.radius * 0.25, -entity.radius * 0.2, entity.radius * 0.22);
        })
      );
      container.add(rock);
    }
  } else if (entity.visualKind === "loot") {
    // Salvage has to read at a glance from across the arena: a bright ring
    // the hull colour of what it gives back, with a cross for repair and a
    // bar for a shield cell, so the pilot decides without reading a label.
    const repair = entity.kind === "repair";
    const tint = repair ? 0x7ef2a4 : 0x7ec8f2;
    const radius = entity.radius;
    const drop = scene.add.image(
      0,
      0,
      bake(
        `loot:${repair ? "repair" : "cell"}:${String(Math.round(radius))}`,
        radius * 1.6 + 4,
        (graphics) => {
          graphics.fillStyle(tint, 0.18);
          graphics.fillCircle(0, 0, radius * 1.6);
          graphics.fillStyle(0x0d1b24, 0.9);
          graphics.fillCircle(0, 0, radius);
          graphics.lineStyle(3, tint, 1);
          graphics.strokeCircle(0, 0, radius);
          graphics.fillStyle(tint, 1);
          if (repair) {
            graphics.fillRect(-radius * 0.55, -radius * 0.18, radius * 1.1, radius * 0.36);
            graphics.fillRect(-radius * 0.18, -radius * 0.55, radius * 0.36, radius * 1.1);
          } else {
            graphics.fillRect(-radius * 0.5, -radius * 0.3, radius, radius * 0.6);
          }
        }
      )
    );
    container.add(drop);
  } else if (entity.visual !== null) {
    // A shell or a rocket the preset gave a silhouette to: same treatment as
    // the rest, one texture per silhouette and calibre.
    const visual = entity.visual;
    const size = entity.radius * visual.modelScale;
    const shot = scene.add.image(
      0,
      0,
      bake(`asset:${visual.shape}:${String(Math.round(size))}`, size * 1.35 + 4, (graphics) => {
        drawCatalogAssetById(graphics, visual.shape, size);
      })
    );
    container.add(shot);
  } else if (entity.visualKind === "missile") {
    const radius = entity.radius;
    const missile = scene.add.image(
      0,
      0,
      bake(`missile:${String(Math.round(radius))}`, radius * 2.9 + 3, (graphics) => {
        // The plume is drawn on the missile axis; a triangle game object
        // would centre itself on its bounding box and drift sideways.
        graphics.fillStyle(0xffd36f, 0.8);
        graphics.fillTriangle(
          -radius * 2.9,
          0,
          -radius * 1.6,
          -radius * 0.65,
          -radius * 1.6,
          radius * 0.65
        );
        graphics.fillStyle(0xff704d, 1);
        graphics.fillRect(-radius * 1.6, -radius * 0.65, radius * 3.2, radius * 1.3);
      })
    );
    container.add(missile);
  } else {
    const style = getProjectileStyle(entity);
    const bullet = scene.add.image(
      0,
      0,
      bake(
        `shot:${String(style.fill)}:${String(Math.round(entity.radius))}`,
        entity.radius + 3,
        (graphics) => {
          graphics.fillStyle(style.fill, 1);
          graphics.fillCircle(0, 0, entity.radius);
          graphics.lineStyle(2, style.stroke, 1);
          graphics.strokeCircle(0, 0, entity.radius);
        }
      )
    );
    container.add(bullet);
  }
  return { object: container, healthBar };
}
