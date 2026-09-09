import type Phaser from "phaser";
import {
  FX_EFFECTS,
  getFxEffect,
  type FxCategory,
  type FxEffect
} from "@spaceship-defender/fx-assets";

import { EXHAUST_ROTATION_OFFSET } from "../spaceshipViewModel.js";

/**
 * The player's own guns. Not a preset slot: the archetype slots are the enemy's
 * business, and the crew's own barrels are the display's.
 */
export const OWN_MUZZLE_EFFECT = "muzzle-flash";

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
  muzzle: 2.4,
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
      .setRotation(effect.oriented && heading !== undefined ? heading + EXHAUST_ROTATION_OFFSET : 0)
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
