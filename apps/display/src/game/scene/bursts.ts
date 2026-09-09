import type Phaser from "phaser";
import { getFxEffect, type FxEffect } from "@spaceship-defender/fx-assets";

/**
 * What a destroyed thing leaves behind.
 *
 * Two effects, not one played after the other: both open on a flash, so back to
 * back they read as a stutter rather than as a bigger event, and 0.55 + 0.6 s
 * outlives its own cause in a busy wave. One per death, chosen by what died.
 */
export type BurstKind = "explosion" | "debris";

const EFFECTS: Record<BurstKind, string> = {
  explosion: "explosion",
  debris: "debris-burst"
};

/**
 * Width the burst is drawn at, in hull radii of the thing that died - so a boss
 * tears a hole and an interceptor pops.
 */
const SPAN: Record<BurstKind, number> = { explosion: 5.5, debris: 4.5 };

/** Above the enemies it replaces (7), below the player's hull (10). */
const DEPTH = 8;

/**
 * Beyond this many at once the screen is already unreadable, and a burst nobody
 * can pick out is not worth a sprite.
 */
const POOL_LIMIT = 12;

/**
 * Which burst a removed entity earns.
 *
 * Enemies only, because an enemy leaving the snapshot *is* a death: the
 * collision resolver is the one thing that drops one, and
 * `removeExpiredAndOutOfBounds` never touches the list. In vacuum there is
 * nothing for a fireball to burn, so an ordinary hull coming apart is debris
 * and a shockwave; the fireball is kept for the boss, where it stays rare
 * enough to still mean something. `isBoss` is authoritative - it is sent once
 * per run precisely so the display never guesses one.
 *
 * Everything else gets nothing, and asteroids are the interesting no: they are
 * destructible, but they also age out of `asteroidLifetimeTicks` and drift out
 * of the arena envelope, and all three look identical from here. Bursting on
 * removal would pop a shockwave in empty space for every rock that simply flew
 * off, and there is a steady stream of them. Shells, missiles and loot leave
 * for reasons that are not death either; an impact effect is a separate matter.
 */
export function burstKindFor(
  visualKind: "asteroid" | "enemy" | "loot" | "missile" | "projectile",
  isBoss: boolean
): BurstKind | undefined {
  if (visualKind !== "enemy") return undefined;
  return isBoss ? "explosion" : "debris";
}

interface PooledBurst {
  readonly sprite: Phaser.GameObjects.Sprite;
  busy: boolean;
}

/**
 * Short-lived one-shot sprites, pooled.
 *
 * Same shape as the exhaust layer: the atlases are queued inside the scene's
 * `create()` and the pool only starts working once they land, because the scene
 * is built synchronously today and a `preload` would move the whole boot order
 * for art that is not needed in the first frame. A wave with no atlas simply
 * has no bursts.
 */
export class BurstLayer {
  private readonly scene: Phaser.Scene;
  private readonly effects = new Map<BurstKind, FxEffect>();
  private readonly pools = new Map<BurstKind, PooledBurst[]>();
  private disposed = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    let queued = false;
    for (const kind of Object.keys(EFFECTS) as BurstKind[]) {
      const effect = getFxEffect(EFFECTS[kind]);
      if (effect === undefined) continue;
      this.effects.set(kind, effect);
      this.pools.set(kind, []);
      if (scene.textures.exists(textureKey(kind))) continue;
      scene.load.spritesheet(textureKey(kind), effect.url, {
        frameWidth: effect.meta.frameWidth,
        frameHeight: effect.meta.frameHeight,
        endFrame: effect.meta.frames - 1
      });
      queued = true;
    }
    if (queued) scene.load.start();
    scene.events.once("shutdown", () => {
      this.disposed = true;
    });
    scene.events.once("destroy", () => {
      this.disposed = true;
    });
  }

  /** Plays one burst, centred on where the thing was last drawn. */
  spawn(kind: BurstKind, x: number, y: number, radius: number): void {
    const effect = this.effects.get(kind);
    const pool = this.pools.get(kind);
    if (this.disposed || effect === undefined || pool === undefined) return;
    if (!this.scene.textures.exists(textureKey(kind))) return;
    const burst = this.take(kind, pool, effect);
    if (burst === undefined) return;
    burst.busy = true;
    burst.sprite
      .setPosition(x, y)
      .setScale((radius * SPAN[kind]) / effect.meta.frameWidth)
      .setVisible(true);
    burst.sprite.play({ key: animationKey(kind), startFrame: 0 }, true);
  }

  private take(kind: BurstKind, pool: PooledBurst[], effect: FxEffect): PooledBurst | undefined {
    const idle = pool.find((entry) => !entry.busy);
    if (idle !== undefined) return idle;
    if (pool.length >= POOL_LIMIT) return undefined;
    if (!this.scene.anims.exists(animationKey(kind))) {
      this.scene.anims.create({
        key: animationKey(kind),
        frames: this.scene.anims.generateFrameNumbers(textureKey(kind), {
          start: 0,
          end: effect.meta.frames - 1
        }),
        frameRate: effect.meta.fps,
        repeat: 0
      });
    }
    const sprite = this.scene.add.sprite(0, 0, textureKey(kind)).setDepth(DEPTH).setVisible(false);
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

function textureKey(kind: BurstKind): string {
  return `fx:${EFFECTS[kind]}`;
}

function animationKey(kind: BurstKind): string {
  return `fx:${EFFECTS[kind]}:once`;
}
