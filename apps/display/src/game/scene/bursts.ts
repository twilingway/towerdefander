import type Phaser from "phaser";
import {
  FX_EFFECTS,
  getFxEffect,
  type FxCategory,
  type FxEffect
} from "@spaceship-defender/fx-assets";

import { MUZZLE_ROTATION_OFFSET, getMuzzlePoint, type Point } from "../spaceshipViewModel.js";

/**
 * The crew's own guns. Not preset slots: the archetype slots are the enemy's
 * business, and the crew's own barrels are the display's. The nose gun gets its
 * own warm flash - the cannon's plasma blue on a machine gun read as the same
 * weapon firing twice.
 */
export const OWN_MUZZLE_EFFECTS: Record<"cannon" | "machineGun", string> = {
  cannon: "muzzle-flash",
  machineGun: "muzzle-flash-mg"
};

/** What the display falls back to when a preset assigns nothing. */
export const DEFAULT_BOSS_DEATH_EFFECT = "explosion";
export const DEFAULT_ENEMY_DEATH_EFFECT = "debris-burst";

/**
 * Width a burst is drawn at, in hull radii of whatever it happened to, by the
 * effect's own category - so a blast tears a hole and a muzzle flash stays the
 * size of a barrel. Category rather than id, because a new effect should not
 * need a table entry to be usable.
 */
const SPAN: Record<FxCategory, number> = {
  exhaust: 2,
  muzzle: 1.6,
  explosion: 5.5,
  destruction: 4.5
};

/** Above the enemies it happens to (7), below the player's hull (10). */
const DEPTH = 8;

/**
 * Beyond this many at once the screen is already unreadable, and a burst nobody
 * can pick out is not worth a sprite. Counted per effect, so a fast-firing
 * archetype's muzzle flashes cannot crowd out a death.
 */
const POOL_LIMIT = 12;

/**
 * Which effect a dead enemy plays.
 *
 * The archetype's own slot wins; without one the display keeps the rule it had
 * before slots existed. In vacuum there is nothing for a fireball to burn, so
 * an ordinary hull coming apart is debris and a shockwave, and the fireball
 * stays with the boss where it is rare enough to still mean something. `isBoss`
 * is authoritative - it is sent once per run precisely so the display never
 * guesses one.
 *
 * Nothing but an enemy earns a death effect. Asteroids are the interesting no:
 * a rock is destructible, but it also ages out of its lifetime and drifts out
 * of the arena envelope, and all three look identical from the removal branch.
 * Shells, missiles and loot leave for reasons that are not death either.
 */
export function deathEffectFor(
  visualKind: "asteroid" | "enemy" | "loot" | "missile" | "projectile",
  isBoss: boolean,
  assigned: string | undefined
): string | undefined {
  if (visualKind !== "enemy") return undefined;
  if (assigned !== undefined && assigned !== "") return assigned;
  return isBoss ? DEFAULT_BOSS_DEATH_EFFECT : DEFAULT_ENEMY_DEATH_EFFECT;
}

/**
 * Ticks a hull must go without a hit effect before it may play another.
 *
 * A hit is spotted by comparing authoritative hp, and under a continuous beam
 * that changes every tick. Without a floor the hull would strobe.
 */
export const HIT_EFFECT_MIN_TICKS = 12;

export function mayPlayHitEffect(tick: number, lastPlayedTick: number | undefined): boolean {
  return lastPlayedTick === undefined || tick - lastPlayedTick >= HIT_EFFECT_MIN_TICKS;
}

/** One shot from the crew's own guns, waiting to be placed on screen. */
export interface OwnShot {
  readonly source: "cannon" | "machineGun";
  /** The shell's own radius, which the muzzle offset counts in. */
  readonly shellRadius: number;
}

/**
 * Puts the crew's own flashes on the barrels that fired them, and empties the
 * queue.
 *
 * Every number here is one the scene just drew, and that is the whole point:
 * the hull on screen is interpolated, a patch behind the room, so a flash
 * placed from the snapshot trails the visible gun by speed times that lag - it
 * looked like the flash was reacting to how fast the ship flew, and with the
 * turret turned back it ended up stretched far off the barrel. The cannon takes
 * the turret's drawn bearing and its mount, the nose gun the hull's.
 */
export function placeOwnShots(
  // Structural rather than the class, so the arithmetic can be tested against a
  // recorder without a scene.
  bursts: Pick<BurstLayer, "spawn"> | undefined,
  shots: OwnShot[],
  pose: {
    readonly mount: Point;
    readonly hull: Point;
    readonly heading: number;
    readonly turretRotation: number;
    readonly hullRadius: number;
  }
): void {
  for (const shot of shots) {
    const fromCannon = shot.source === "cannon";
    const bearing = fromCannon ? pose.turretRotation : pose.heading;
    const origin = fromCannon ? pose.mount : pose.hull;
    const point = getMuzzlePoint(origin, bearing, pose.hullRadius + shot.shellRadius);
    bursts?.spawn(OWN_MUZZLE_EFFECTS[shot.source], point.x, point.y, pose.hullRadius, bearing);
  }
  shots.length = 0;
}

interface PooledBurst {
  readonly sprite: Phaser.GameObjects.Sprite;
  busy: boolean;
}

/**
 * Short-lived one-shot sprites, pooled per effect.
 *
 * Same shape as the exhaust layer: every one-shot atlas is queued inside the
 * scene's `create()` and the pool starts working once they land, because the
 * scene is built synchronously today and a `preload` would move the whole boot
 * order for art that is not needed in the first frame. A wave with no atlas
 * simply has no bursts.
 */
export class BurstLayer {
  private readonly scene: Phaser.Scene;
  private readonly pools = new Map<string, PooledBurst[]>();
  private disposed = false;

  constructor(scene: Phaser.Scene) {
    let queued = false;
    this.scene = scene;
    // Every one-shot effect, not only the ones a preset happens to use today: a
    // slot can name any of them, and the console can change that between runs.
    for (const effect of FX_EFFECTS) {
      if (effect.loop) continue;
      this.pools.set(effect.id, []);
      if (scene.textures.exists(textureKey(effect.id))) continue;
      scene.load.spritesheet(textureKey(effect.id), effect.url, {
        frameWidth: effect.meta.frameWidth,
        frameHeight: effect.meta.frameHeight,
        endFrame: effect.meta.frames - 1
      });
      queued = true;
    }
    // The boot loader is long finished by the time a scene is running, so a
    // queue added here has to be started by hand.
    if (queued) scene.load.start();
    scene.events.once("shutdown", () => {
      this.disposed = true;
    });
    scene.events.once("destroy", () => {
      this.disposed = true;
    });
  }

  /**
   * Plays one burst, centred where the thing was last drawn. `heading` turns an
   * oriented effect - one authored pointing up - to face the same way as the
   * hull; a circular effect ignores it.
   */
  spawn(effectId: string, x: number, y: number, radius: number, heading?: number): void {
    const effect = getFxEffect(effectId);
    const pool = this.pools.get(effectId);
    if (this.disposed || effect === undefined || pool === undefined) return;
    if (!this.scene.textures.exists(textureKey(effectId))) return;
    const burst = this.take(effect, pool);
    if (burst === undefined) return;
    burst.busy = true;
    burst.sprite
      .setPosition(x, y)
      .setRotation(effect.oriented && heading !== undefined ? heading + MUZZLE_ROTATION_OFFSET : 0)
      .setScale((radius * SPAN[effect.category]) / effect.meta.frameWidth)
      .setVisible(true);
    burst.sprite.play({ key: animationKey(effectId), startFrame: 0 }, true);
  }

  private take(effect: FxEffect, pool: PooledBurst[]): PooledBurst | undefined {
    const idle = pool.find((entry) => !entry.busy);
    if (idle !== undefined) return idle;
    if (pool.length >= POOL_LIMIT) return undefined;
    if (!this.scene.anims.exists(animationKey(effect.id))) {
      this.scene.anims.create({
        key: animationKey(effect.id),
        frames: this.scene.anims.generateFrameNumbers(textureKey(effect.id), {
          start: 0,
          end: effect.meta.frames - 1
        }),
        frameRate: effect.meta.fps,
        repeat: 0
      });
    }
    const sprite = this.scene.add
      .sprite(0, 0, textureKey(effect.id))
      /*
       * Additive, because that is how the effect was lit. Its layers are drawn
       * on `add` inside the editor and exported to RGBA, so the dark tail of
       * every gradient survives as dark pixels with some alpha. Over space that
       * goes unnoticed; over the ship's own hull it composited as a dark slab -
       * the "black square between the flash and the gun".
       */
      .setBlendMode("ADD")
      // An oriented effect is authored with its source on the bottom edge, so
      // pinning that edge puts the source exactly where it was fired from and
      // makes the sprite turn about it. A circular one stays centred.
      .setOrigin(0.5, effect.oriented ? 1 : 0.5)
      .setDepth(DEPTH)
      .setVisible(false);
    const entry: PooledBurst = { sprite, busy: false };
    // Registered once per sprite, not per spawn: the pool reuses both the
    // sprite and its handler.
    sprite.on("animationcomplete", () => {
      entry.busy = false;
      sprite.setVisible(false);
    });
    pool.push(entry);
    return entry;
  }
}

function textureKey(effectId: string): string {
  return `fx:${effectId}`;
}

function animationKey(effectId: string): string {
  return `fx:${effectId}:once`;
}
