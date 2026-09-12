import type Phaser from "phaser";
import type { DisplayGameSnapshot, PublicArenaShipView } from "@spaceship-defender/protocol";

import {
  createAngleTrack,
  createPointTrack,
  extendAngleTrack,
  extendPointTrack,
  sampleAngleTrack,
  samplePointTrack,
  type AngleTrack,
  type PointTrack
} from "../playback.js";
import type { LiveEntity } from "../../model/shipPrediction.js";
import { drawCatalogAssetById } from "../catalogRenderer.js";
import { drawSpaceshipHull } from "../entityArt.js";
import {
  DEFAULT_ENEMY_DEATH_EFFECT,
  OWN_MUZZLE_EFFECTS,
  deathEffectFor,
  type BurstLayer
} from "./bursts.js";
import type { ScenePrediction } from "./entities.js";

/** Where the scene has actually drawn the player's own hull this frame. */
export interface DrawnOwnPose {
  readonly x: number;
  readonly y: number;
  readonly heading: number;
  readonly turretAngle: number;
  readonly shieldAngle: number;
}

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
  readonly shieldBack: Phaser.GameObjects.Image;
  readonly shieldFill: Phaser.GameObjects.Image;
  readonly flash: Phaser.GameObjects.Image;
  /**
   * Whether this is the hull the player is flying. The scene draws that one
   * itself, so only its bars belong here.
   */
  readonly isSelf: boolean;
  /**
   * The hull as the interpolator sees it, bound once when the sprite is made.
   *
   * This is the path the campaign's enemies are drawn on and the one the solo
   * mode was polished against: the library plays a collection back on its own
   * measured delay, which is the clock every shell and every rock on the field
   * is already drawn on. Running these sixteen on the scene's clock instead put
   * them a few milliseconds off everything around them, and a fight between two
   * clocks reads as a twitch.
   */
  live: LiveEntity | undefined;
  /**
   * The last two authoritative samples, played back on the scene's own clock.
   *
   * The same tracks every other entity in the world is drawn from. They were a
   * lerp toward the newest patch, which is a different clock from the rest of
   * the picture: it eases, never quite arrives and changes speed with the frame
   * rate, and a thin horizontal bar over the hull shows that as a twitch long
   * before a rotating sprite does.
   */
  position: PointTrack;
  heading: AngleTrack;
  turretAngle: AngleTrack;
  shieldAngle: AngleTrack;
  hp: number;
  maxHp: number;
  flashLeftMs: number;
  /** True once this hull has been drawn dying; a wreck is played once. */
  wrecked: boolean;
  /**
   * What was last drawn of this hull's shooting and its barrier, so the next
   * patch can be read as events rather than as numbers: a shot fired, a shell
   * that got through, a shell the sector stopped.
   */
  drawnShots: number;
  drawnShield: number;
}

const RIVAL_TINT = 0xff9f8a;
const SHIELD_COLOR = 0x63d8ff;
const HEALTH_BACK = 0x0a1a22;
const HEALTH_HIGH = 0x74e39b;
const HEALTH_LOW = 0xff6b5e;
const FLASH_COLOR = 0xffe6a0;
const FLASH_MS = 140;
/** What a sector plays where it stopped a shell; the crew's own hull plays it too. */
const SHIELD_IMPACT_EFFECT = "shield-impact";
/** Bar geometry, in hull radii, so it scales with whatever ship is flown. */
const BAR_WIDTH = 2.2;
const BAR_HEIGHT = 0.26;

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

  /** Takes the newest patch: a sample on every track, health, and a hit flash. */
  sync(
    scene: Phaser.Scene,
    snapshot: DisplayGameSnapshot,
    bake: BakeShape,
    snap = false,
    prediction?: ScenePrediction,
    bursts?: BurstLayer
  ): void {
    // Every hull, the player's own included: the scene draws that one's art, but
    // its health and its sector are the same question a rival's bars answer, and
    // the answer belongs over the ship rather than only in a panel.
    const seen = new Set<string>();
    const toTick = snapshot.tick;

    for (const ship of snapshot.arenaShips) {
      seen.add(ship.entityId);
      const parts =
        this.hulls.get(ship.entityId) ?? this.create(scene, snapshot, ship, bake, toTick);
      this.hulls.set(ship.entityId, parts);
      // A binding missed at birth - a sprite made from a view the room had
      // already moved past - would leave that one hull on the scene's clock for
      // as long as it lives, which is the enemy layer's own rule.
      parts.live ??= prediction?.bind(ship.entityId, "arenaShip");

      /*
       * Three events, all read out of numbers rather than sent as events.
       *
       * The arena publishes no shots and no hits, only what each hull has and
       * how much of it - so the display asks what changed since the last patch.
       * A counter that moved is a barrel that fired; health that fell is a
       * shell that got through; a battery that fell while the health did not is
       * a shell the sector stopped. All three are exactly what a pilot needs to
       * see, and none of them costs a byte more on the wire.
       */
      const fired = ship.shotsFired - parts.drawnShots;
      if (fired > 0 && parts.drawnShots > 0 && !parts.isSelf) {
        bursts?.spawn(
          OWN_MUZZLE_EFFECTS.cannon,
          parts.turret.x,
          parts.turret.y,
          ship.radius,
          parts.turret.rotation
        );
      }
      parts.drawnShots = ship.shotsFired;

      if (ship.hp < parts.hp - 0.01) {
        parts.flashLeftMs = FLASH_MS;
        bursts?.spawn(DEFAULT_ENEMY_DEATH_EFFECT, parts.hull.x, parts.hull.y, ship.radius * 0.6);
      } else if (ship.shieldActive && ship.shieldEnergy < parts.drawnShield - 0.01) {
        // On the barrier rather than on the hull: the sector is what stopped it.
        bursts?.spawn(
          SHIELD_IMPACT_EFFECT,
          parts.hull.x + Math.cos(ship.shieldAngle) * ship.shieldRadius,
          parts.hull.y + Math.sin(ship.shieldAngle) * ship.shieldRadius,
          ship.radius,
          ship.shieldAngle
        );
      }
      parts.drawnShield = ship.shieldEnergy;
      parts.hp = ship.hp;
      parts.maxHp = ship.maxHp;
      if (snap) {
        // A hydration is not a move: there is no earlier sample to walk out of,
        // so the tracks start again where the room says the hull is.
        parts.position = createPointTrack(ship, toTick);
        parts.heading = createAngleTrack(ship.heading, toTick);
        parts.turretAngle = createAngleTrack(ship.turretAngle, toTick);
        parts.shieldAngle = createAngleTrack(ship.shieldAngle, toTick);
      } else {
        parts.position = extendPointTrack(parts.position, ship, toTick);
        parts.heading = extendAngleTrack(parts.heading, ship.heading, toTick);
        parts.turretAngle = extendAngleTrack(parts.turretAngle, ship.turretAngle, toTick);
        parts.shieldAngle = extendAngleTrack(parts.shieldAngle, ship.shieldAngle, toTick);
      }
      /*
       * The wreck, played once and then left alone.
       *
       * A hull used to leave the collection on the tick it died, so its health
       * bar never reached zero and the ship blinked out - the last rival of a
       * match simply stopped existing. It now arrives dead first, which is the
       * frame the explosion belongs on.
       */
      if (!ship.alive && !parts.wrecked) {
        parts.wrecked = true;
        const effect = deathEffectFor("enemy", false, undefined);
        if (effect !== undefined) bursts?.spawn(effect, parts.hull.x, parts.hull.y, ship.radius);
        parts.hull.setVisible(false);
        parts.turret.setVisible(false);
        parts.shield.setVisible(false);
        parts.healthBack.setVisible(false);
        parts.healthFill.setVisible(false);
        parts.shieldBack.setVisible(false);
        parts.shieldFill.setVisible(false);
      }
      if (parts.wrecked) continue;
      parts.shield.setVisible(!parts.isSelf && ship.shieldActive);
      this.drawBars(parts, ship);
    }

    for (const [id, parts] of this.hulls) {
      if (seen.has(id)) continue;
      destroyHull(parts);
      this.hulls.delete(id);
    }
  }

  /**
   * One drawn frame, on the scene's playback clock.
   *
   * The same clock the rest of the world is drawn on, which is the point: a
   * rival and the shell flying past it have to be sampled at one moment or the
   * shot misses on screen and lands in the room. The player's own hull is the
   * exception - it is drawn from the predicted pose, so its bars are placed on
   * that pose rather than on the sample the room last sent, which is where they
   * were twitching against the ship they belong to.
   */
  update(
    playbackTick: number,
    deltaMs: number,
    own: DrawnOwnPose | undefined,
    prediction: ScenePrediction | undefined
  ): void {
    for (const parts of this.hulls.values()) {
      // A wreck is a sprite that has already been hidden; nothing left to move.
      if (parts.wrecked) continue;
      const mine = parts.isSelf && own !== undefined ? own : undefined;
      // Bound first, the scene's own tracks second: the tracks are the fallback
      // for a page with no prediction running, exactly as they are for enemies.
      const live = mine === undefined ? parts.live : undefined;
      const bound =
        live !== undefined && prediction !== undefined ? prediction.read(live) : undefined;
      const point = mine ?? bound ?? samplePointTrack(parts.position, playbackTick);
      const x = point.x;
      const y = point.y;
      const angle = (field: "heading" | "turretAngle" | "shieldAngle"): number => {
        if (mine !== undefined) return mine[field];
        if (bound !== undefined && live !== undefined && prediction !== undefined) {
          return prediction.angleOf(live, field);
        }
        return sampleAngleTrack(parts[field], playbackTick);
      };
      parts.hull.setPosition(x, y).setRotation(angle("heading"));
      parts.turret.setPosition(x, y).setRotation(angle("turretAngle"));
      parts.shield.setPosition(x, y).setRotation(angle("shieldAngle"));

      const barY = y - parts.hull.displayHeight * 0.75;
      const left = x - parts.healthBack.displayWidth / 2;
      parts.healthBack.setPosition(x, barY);
      parts.healthFill.setPosition(left, barY).setOrigin(0, 0.5);
      const shieldY = barY - parts.healthBack.displayHeight * 1.1;
      parts.shieldBack.setPosition(x, shieldY);
      parts.shieldFill.setPosition(left, shieldY).setOrigin(0, 0.5);

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

  /**
   * Two bars over the hull: what it has left, and what its sector has left.
   *
   * Sized from the patch rather than from the frame - they change when the
   * numbers change, which is twenty times a second at most, while the frame
   * runs at whatever the screen does.
   */
  private drawBars(parts: FleetHull, ship: PublicArenaShipView): void {
    const width = ship.radius * BAR_WIDTH;
    const height = ship.radius * BAR_HEIGHT;
    const health = parts.maxHp <= 0 ? 0 : clamp01(parts.hp / parts.maxHp);
    parts.healthBack.setDisplaySize(width, height);
    parts.healthFill
      .setDisplaySize(Math.max(1, width * health), height)
      .setTint(health > 0.35 ? HEALTH_HIGH : HEALTH_LOW);

    const shield = ship.shieldCapacity <= 0 ? 0 : clamp01(ship.shieldEnergy / ship.shieldCapacity);
    const thin = height * 0.6;
    parts.shieldBack.setDisplaySize(width, thin);
    parts.shieldFill.setDisplaySize(Math.max(1, width * shield), thin);
    // A sector that is up reads as lit; a charged but lowered one still shows
    // what it holds, because that is what a player is deciding about.
    parts.shieldFill.setAlpha(ship.shieldActive ? 1 : 0.45);
  }

  private create(
    scene: Phaser.Scene,
    snapshot: DisplayGameSnapshot,
    ship: PublicArenaShipView,
    bake: BakeShape,
    toTick: number
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

    /*
     * The player's own art is the scene's job, not this class's: it is drawn
     * from the predicted pose, with its own shield and its own turret. Only the
     * bars are added here, so the hull that matters most is not the one hull
     * without a readout over it.
     */
    const own = ship.isSelf;
    return {
      isSelf: own,
      hull: scene.add
        .image(ship.x, ship.y, hullKey)
        .setDepth(10)
        .setTint(RIVAL_TINT)
        .setVisible(!own),
      turret: scene.add
        .image(ship.x, ship.y, turretKey)
        .setDepth(12)
        .setTint(RIVAL_TINT)
        .setVisible(!own),
      shield: scene.add.image(ship.x, ship.y, shieldKey).setDepth(11).setVisible(false),
      healthBack: scene.add.image(ship.x, ship.y, pixelKey).setDepth(13).setTint(HEALTH_BACK),
      healthFill: scene.add.image(ship.x, ship.y, pixelKey).setDepth(14).setTint(HEALTH_HIGH),
      shieldBack: scene.add.image(ship.x, ship.y, pixelKey).setDepth(13).setTint(HEALTH_BACK),
      shieldFill: scene.add.image(ship.x, ship.y, pixelKey).setDepth(14).setTint(SHIELD_COLOR),
      flash: scene.add.image(ship.x, ship.y, flashKey).setDepth(15).setVisible(false),
      live: undefined,
      // A hull appears already formed at the newest tick; there is no earlier
      // authoritative sample to walk it out of.
      position: createPointTrack(ship, toTick),
      heading: createAngleTrack(ship.heading, toTick),
      turretAngle: createAngleTrack(ship.turretAngle, toTick),
      shieldAngle: createAngleTrack(ship.shieldAngle, toTick),
      wrecked: false,
      drawnShots: ship.shotsFired,
      drawnShield: ship.shieldEnergy,
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
  parts.shieldBack.destroy();
  parts.shieldFill.destroy();
  parts.flash.destroy();
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
