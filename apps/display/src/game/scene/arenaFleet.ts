import type Phaser from "phaser";
import type { DisplayGameSnapshot, PublicArenaShipView } from "@spaceship-defender/protocol";

import { drawCatalogAssetById } from "../catalogRenderer.js";
import { drawSpaceshipHull } from "../entityArt.js";

/** Bakes a drawing centred on zero and hands back its texture key. */
type BakeShape = (
  key: string,
  half: number,
  draw: (graphics: Phaser.GameObjects.Graphics) => void
) => string;

interface FleetHull {
  readonly hull: Phaser.GameObjects.Image;
  readonly turret: Phaser.GameObjects.Image;
  readonly shield: Phaser.GameObjects.Image;
}

const RIVAL_TINT = 0xff9f8a;
const SHIELD_COLOR = 0x63d8ff;

/**
 * The other fifteen ships of a match, drawn as what they are.
 *
 * Not enemies: every hull in the arena is a copy of the crew's own ship, with
 * the same silhouette, the same turret and the same shield, flown by the same
 * autopilot. So they are drawn from the same art rather than from the enemy
 * catalogue - the only difference is a tint, because a player still has to
 * find themselves on a field of sixteen identical ships.
 *
 * Baked and reused, like everything else on this field: one hull texture, one
 * turret texture and one shield arc serve all sixteen, and the per-frame work
 * is a position and two rotations each.
 */
export class ArenaFleet {
  private readonly hulls = new Map<string, FleetHull>();

  sync(scene: Phaser.Scene, snapshot: DisplayGameSnapshot, bake: BakeShape): void {
    const fleet = snapshot.arenaShips.filter((ship) => !ship.isSelf);
    const seen = new Set<string>();

    for (const ship of fleet) {
      seen.add(ship.shipId);
      const parts = this.hulls.get(ship.shipId) ?? this.create(scene, snapshot, ship, bake);
      this.hulls.set(ship.shipId, parts);

      parts.hull.setPosition(ship.x, ship.y).setRotation(ship.heading);
      parts.turret.setPosition(ship.x, ship.y).setRotation(ship.turretAngle);
      parts.shield
        .setPosition(ship.x, ship.y)
        .setRotation(ship.shieldAngle)
        .setVisible(ship.shieldActive);
    }

    for (const [id, parts] of this.hulls) {
      if (seen.has(id)) continue;
      parts.hull.destroy();
      parts.turret.destroy();
      parts.shield.destroy();
      this.hulls.delete(id);
    }
  }

  destroy(): void {
    for (const parts of this.hulls.values()) {
      parts.hull.destroy();
      parts.turret.destroy();
      parts.shield.destroy();
    }
    this.hulls.clear();
  }

  private create(
    scene: Phaser.Scene,
    snapshot: DisplayGameSnapshot,
    ship: PublicArenaShipView,
    bake: BakeShape
  ): FleetHull {
    const radius = ship.radius;
    const hullVisual = snapshot.spaceshipVisual;
    const hullKey = bake(
      `arenaHull:${hullVisual?.shape ?? "default"}:${String(Math.round(radius))}`,
      radius * (hullVisual?.modelScale ?? 1) * 1.35 + 6,
      (graphics) => {
        drawSpaceshipHull(graphics, {
          spaceship: { ...snapshot.spaceship, radius },
          spaceshipVisual: hullVisual
        });
      }
    );

    const turretVisual = snapshot.turretVisual;
    const turretKey = bake(
      `arenaTurret:${turretVisual?.shape ?? "none"}:${String(Math.round(radius))}`,
      radius * (turretVisual?.modelScale ?? 1) * 1.6 + 6,
      (graphics) => {
        if (turretVisual === null) {
          graphics.fillStyle(0xffd36f, 1);
          graphics.fillRect(-radius * 0.2, -radius * 0.12, radius * 1.5, radius * 0.24);
          return;
        }
        drawCatalogAssetById(graphics, turretVisual.shape, radius * turretVisual.modelScale);
      }
    );

    // One arc, turned rather than redrawn: the sector is the same shape on
    // every ship, and a Graphics per hull would be fifteen shapes re-walked
    // every frame for a picture that never changes.
    const shieldKey = bake(
      `arenaShield:${String(Math.round(ship.shieldRadius))}:${ship.shieldArcHalfAngle.toFixed(2)}`,
      ship.shieldRadius + 8,
      (graphics) => {
        graphics.lineStyle(6, SHIELD_COLOR, 0.75);
        graphics.beginPath();
        graphics.arc(
          0,
          0,
          ship.shieldRadius,
          -ship.shieldArcHalfAngle,
          ship.shieldArcHalfAngle,
          false
        );
        graphics.strokePath();
      }
    );

    return {
      hull: scene.add.image(ship.x, ship.y, hullKey).setDepth(10).setTint(RIVAL_TINT),
      turret: scene.add.image(ship.x, ship.y, turretKey).setDepth(12).setTint(RIVAL_TINT),
      shield: scene.add.image(ship.x, ship.y, shieldKey).setDepth(11).setVisible(false)
    };
  }
}
