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
  readonly healthBack: Phaser.GameObjects.Image;
  readonly healthFill: Phaser.GameObjects.Image;
  readonly flash: Phaser.GameObjects.Image;
  /** Where the last patch said this hull is; the frame walks toward it. */
  target: { x: number; y: number; heading: number; turret: number; shieldAngle: number };
  hp: number;
  maxHp: number;
  flashLeftMs: number;
}

const RIVAL_TINT = 0xff9f8a;
const SHIELD_COLOR = 0x63d8ff;
const HEALTH_BACK = 0x0a1a22;
const HEALTH_HIGH = 0x74e39b;
const HEALTH_LOW = 0xff6b5e;
const FLASH_COLOR = 0xffe6a0;
const FLASH_MS = 140;

/**
 * The other fifteen ships of a match, drawn as what they are.
 *
 * Not enemies: every hull in the arena is a copy of the crew's own ship, with
 * the same silhouette, the same turret and the same shield, flown by the same
 * autopilot. So they are drawn from the same art rather than from the enemy
 * catalogue - the only difference is a tint, because a player still has to find
 * themselves on a field of sixteen identical ships.
 *
 * Baked and reused: one hull texture, one turret, one shield arc and one bar
 * serve all sixteen, so a frame is a position and a couple of rotations each.
 * Between patches the hulls are walked toward the last position the server
 * gave, or they would stand still twenty times a second and look like statues
 * shooting at each other.
 */
export class ArenaFleet {
  private readonly hulls = new Map<string, FleetHull>();

  /** Takes the newest patch: targets, health, and a flash for anything hit. */
  sync(scene: Phaser.Scene, snapshot: DisplayGameSnapshot, bake: BakeShape): void {
    const fleet = snapshot.arenaShips.filter((ship) => !ship.isSelf);
    const seen = new Set<string>();

    for (const ship of fleet) {
      seen.add(ship.shipId);
      const parts = this.hulls.get(ship.shipId) ?? this.create(scene, snapshot, ship, bake);
      this.hulls.set(ship.shipId, parts);

      // Losing health is the only hit signal the arena has on the wire, and it
      // is enough: a flash where the shell landed is what makes a firefight
      // legible from across the room.
      if (ship.hp < parts.hp - 0.01) parts.flashLeftMs = FLASH_MS;
      parts.hp = ship.hp;
      parts.maxHp = ship.maxHp;
      parts.target = {
        x: ship.x,
        y: ship.y,
        heading: ship.heading,
        turret: ship.turretAngle,
        shieldAngle: ship.shieldAngle
      };
      parts.shield.setVisible(ship.shieldActive);
      this.drawHealth(parts, ship.radius);
    }

    for (const [id, parts] of this.hulls) {
      if (seen.has(id)) continue;
      destroyHull(parts);
      this.hulls.delete(id);
    }
  }

  /**
   * One frame of motion between patches.
   *
   * A plain lerp with a rate rather than a fixed share, so the catch-up speed
   * does not depend on how often frames happen to arrive.
   */
  update(deltaMs: number): void {
    const step = Math.min(1, deltaMs / 90);
    for (const parts of this.hulls.values()) {
      const x = parts.hull.x + (parts.target.x - parts.hull.x) * step;
      const y = parts.hull.y + (parts.target.y - parts.hull.y) * step;
      parts.hull
        .setPosition(x, y)
        .setRotation(turnToward(parts.hull.rotation, parts.target.heading, step));
      parts.turret
        .setPosition(x, y)
        .setRotation(turnToward(parts.turret.rotation, parts.target.turret, step));
      parts.shield
        .setPosition(x, y)
        .setRotation(turnToward(parts.shield.rotation, parts.target.shieldAngle, step));

      const barY = y - parts.hull.displayHeight * 0.75;
      parts.healthBack.setPosition(x, barY);
      parts.healthFill.setPosition(x - parts.healthBack.displayWidth / 2, barY).setOrigin(0, 0.5);

      if (parts.flashLeftMs <= 0) {
        parts.flash.setVisible(false);
        continue;
      }
      parts.flashLeftMs -= deltaMs;
      parts.flash
        .setPosition(x, y)
        .setVisible(true)
        .setAlpha(Math.max(0, parts.flashLeftMs / FLASH_MS));
    }
  }

  destroy(): void {
    for (const parts of this.hulls.values()) destroyHull(parts);
    this.hulls.clear();
  }

  private drawHealth(parts: FleetHull, radius: number): void {
    const share = parts.maxHp <= 0 ? 0 : Math.max(0, Math.min(1, parts.hp / parts.maxHp));
    parts.healthBack.setDisplaySize(radius * 2.2, radius * 0.28);
    parts.healthFill
      .setDisplaySize(Math.max(1, radius * 2.2 * share), radius * 0.28)
      .setTint(share > 0.35 ? HEALTH_HIGH : HEALTH_LOW);
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

    /*
     * One arc, turned rather than redrawn, and thick enough to survive the
     * camera: the arena is framed four thousand units wide, so a line of six
     * units came out two pixels and read as nothing at all.
     */
    const shieldKey = bake(
      `arenaShield:${String(Math.round(ship.shieldRadius))}:${ship.shieldArcHalfAngle.toFixed(2)}`,
      ship.shieldRadius + 14,
      (graphics) => {
        graphics.lineStyle(18, SHIELD_COLOR, 0.85);
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

    const pixelKey = bake("arenaPixel", 2, (graphics) => {
      graphics.fillStyle(0xffffff, 1);
      graphics.fillRect(-2, -2, 4, 4);
    });
    const flashKey = bake("arenaHitFlash", 26, (graphics) => {
      graphics.fillStyle(FLASH_COLOR, 0.9);
      graphics.fillCircle(0, 0, 22);
    });

    return {
      hull: scene.add.image(ship.x, ship.y, hullKey).setDepth(10).setTint(RIVAL_TINT),
      turret: scene.add.image(ship.x, ship.y, turretKey).setDepth(12).setTint(RIVAL_TINT),
      shield: scene.add.image(ship.x, ship.y, shieldKey).setDepth(11).setVisible(false),
      healthBack: scene.add.image(ship.x, ship.y, pixelKey).setDepth(13).setTint(HEALTH_BACK),
      healthFill: scene.add.image(ship.x, ship.y, pixelKey).setDepth(14).setTint(HEALTH_HIGH),
      flash: scene.add.image(ship.x, ship.y, flashKey).setDepth(15).setVisible(false),
      target: {
        x: ship.x,
        y: ship.y,
        heading: ship.heading,
        turret: ship.turretAngle,
        shieldAngle: ship.shieldAngle
      },
      hp: ship.hp,
      maxHp: ship.maxHp,
      flashLeftMs: 0
    };
  }
}

function destroyHull(parts: FleetHull): void {
  parts.hull.destroy();
  parts.turret.destroy();
  parts.shield.destroy();
  parts.healthBack.destroy();
  parts.healthFill.destroy();
  parts.flash.destroy();
}

/** Shortest way round, so a hull crossing north does not spin the long way. */
function turnToward(current: number, target: number, step: number): number {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + delta * step;
}
