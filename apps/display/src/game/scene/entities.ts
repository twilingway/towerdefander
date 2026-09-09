import type Phaser from "phaser";
import type {
  DisplayGameSnapshot,
  PublicAsteroidView,
  PublicEnemyView,
  PublicHomingMissileView,
  PublicLootDropView,
  PublicProjectileView
} from "@spaceship-defender/protocol";

import type { LiveEntity, LiveEntityKind, LivePlacement } from "../../model/shipPrediction.js";
import { deathEffectFor, mayPlayHitEffect, type BurstLayer, type OwnShot } from "./bursts.js";
import { reconcileStableIds } from "../spaceshipViewModel.js";
import { resolveShieldImpact, SHIELD_BLOCK_EFFECT, type ShieldPose } from "./shieldImpact.js";
import {
  createAngleTrack,
  createPointTrack,
  extendAngleTrack,
  extendPointTrack,
  type AngleTrack,
  type PointTrack
} from "../playback.js";
import { drawCatalogAssetById } from "../catalogRenderer.js";
import {
  createEnemyHealthBar,
  drawEnemyBody,
  resolveEnemyVisual,
  setEnemyHealthBar
} from "../entityArt.js";
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

export interface CombatVisual {
  readonly object: Phaser.GameObjects.Container;
  readonly healthBar: Phaser.GameObjects.Container | undefined;
  /**
   * The health the bar was last drawn at.
   *
   * A bar is geometry, and it was being rebuilt for every enemy on every patch
   * whether or not anything had hit it - twenty enemies at twenty-six patches a
   * second is five hundred rebuilds a second to draw the same rectangle. It
   * changes only when the enemy is hit, so that is when it is redrawn.
   */
  drawnHealth: number;
  position: PointTrack;
  angle: AngleTrack;
  /**
   * Set only for shells, and only because they are the one thing here that can
   * be carried forward honestly.
   *
   * Interpolation draws an entity between the two newest snapshots - that is,
   * in the past. For a hull that is unavoidable: nobody knows what the pilot
   * will do next. A shell has no driver, so its speed and bearing are already
   * on the wire and advancing it is arithmetic rather than a guess. Without it
   * the shot appears a tenth of a second behind the ship that fired it, which
   * at three hundred units a second is further than the hull is wide - and it
   * reads exactly as bullets coming out of nowhere.
   */
  velocity: { readonly x: number; readonly y: number } | undefined;
  /**
   * The room's own entity, bound once when the sprite is made.
   *
   * Set only while a cockpit is streaming. Where it is set, the entity is read
   * off the same clock as this page's ship, which is the whole reason it is
   * here: a hull read from the predictor and a world read from the snapshot are
   * a hundred milliseconds apart, and a shell that leaves the barrel across
   * that gap comes out of empty space.
   */
  live: LiveEntity | undefined;
  /**
   * What this entity plays on each of its events, resolved once when the sprite
   * is made: the archetype's own slot where a preset assigned one, the display's
   * fallback where it did not. Undefined is "nothing here" - which is every
   * event of everything that is not an enemy.
   */
  readonly deathEffect: string | undefined;
  /**
   * The splash this leaving the snapshot may mean, when the shield stopped it.
   *
   * Set for hostile shells and nothing else, and resolved at creation the way
   * the other three slots are, so the removal branch needs no catalogue: what it
   * still has to decide is whether the sector was actually what stopped this
   * one, and that is geometry.
   */
  readonly blockEffect: string | undefined;
  readonly hitEffect: string | undefined;
  readonly shotEffect: string | undefined;
  /** Last known hull radius, which is what a burst is sized against. */
  readonly radius: number;
  /** Shot count this visual has already reacted to; see `drawnHealth`. */
  drawnShots: number;
  /** When the hit effect last played, so a beam cannot strobe the hull. */
  hitEffectTick: number | undefined;
}

/**
 * Where the crew's own shot left the ship, or undefined if the shell was not
 * theirs. The cannon leaves its mount and points along the turret; the nose gun
 * leaves the nose and points along the hull.
 */
function collectCombatEntities(snapshot: DisplayGameSnapshot): CombatEntity[] {
  return [
    ...snapshot.enemyShips.map((entity) => ({ ...entity, visualKind: "enemy" as const })),
    ...snapshot.asteroids.map((entity) => ({ ...entity, visualKind: "asteroid" as const })),
    ...snapshot.lootDrops.map((entity) => ({ ...entity, visualKind: "loot" as const })),
    ...snapshot.friendlyProjectiles.map((entity) => ({
      ...entity,
      visualKind: "projectile" as const
    })),
    ...snapshot.hostileProjectiles.map((entity) => ({
      ...entity,
      visualKind: "projectile" as const
    })),
    ...snapshot.homingMissiles.map((entity) => ({ ...entity, visualKind: "missile" as const }))
  ];
}

/**
 * The hull look travels with the preset, so an unknown id falls back the same
 * way an enemy silhouette does rather than leaving the ship invisible.
 */
/** What the scene needs from the turret, whichever shape it ends up being. */

/** Everything reconciling a wave of visuals needs, and nothing it does not. */
interface ReconcileRequest {
  readonly scene: Phaser.Scene;
  readonly visuals: Map<string, CombatVisual>;
  readonly snapshot: DisplayGameSnapshot;
  readonly prediction: ScenePrediction | undefined;
  readonly tankLook: boolean;
  readonly bake: BakeShape;
  readonly toTick: number;
  readonly snap: boolean;
  readonly bursts: BurstLayer | undefined;
  /**
   * Shots the crew's own guns just fired, for the scene to place. Collected
   * rather than drawn here: the muzzle has to come off the pose the scene draws,
   * and reconcile runs on a patch arriving, not on a frame going out.
   */
  readonly ownShots: OwnShot[];
  /** The shield as the scene drew it, for placing a splash on the barrier. */
  readonly shieldPose: ShieldPose | undefined;
}

export function reconcileCombatVisuals({
  scene,
  visuals,
  snapshot,
  prediction,
  tankLook,
  bake,
  toTick,
  snap,
  bursts,
  ownShots,
  shieldPose
}: ReconcileRequest): void {
  const incoming = collectCombatEntities(snapshot);
  const incomingById = new Map(incoming.map((entity) => [entity.entityId, entity]));
  const plan = reconcileStableIds(visuals.keys(), incomingById.keys());
  for (const entityId of plan.remove) {
    const leaving = visuals.get(entityId);
    // A snapping reconcile is a hydration or a fresh run, not a wave of deaths:
    // bursting here would carpet the screen on every reconnect.
    if (!snap && leaving?.deathEffect !== undefined) {
      bursts?.spawn(leaving.deathEffect, leaving.object.x, leaving.object.y, leaving.radius);
    }
    if (!snap && leaving?.blockEffect !== undefined && leaving.velocity !== undefined) {
      // The last point the room published, not the drawn one: the drawn shell is
      // extrapolated forward and the decision is made in the room's own frame.
      const seen = leaving.position.current.to;
      const impact = resolveShieldImpact(
        { x: seen.x, y: seen.y, velocity: leaving.velocity },
        snapshot,
        shieldPose
      );
      if (impact !== undefined) {
        // The barrier's radius, not the shell's: see `SPAN.shield`.
        bursts?.spawn(
          leaving.blockEffect,
          impact.x,
          impact.y,
          snapshot.shieldRadius,
          impact.normal
        );
      }
    }
    leaving?.object.destroy();
    visuals.delete(entityId);
  }
  for (const entityId of [...plan.create, ...plan.update]) {
    const entity = incomingById.get(entityId);
    if (entity === undefined) continue;
    const heading = getEntityHeading(entity);
    const visual = visuals.get(entityId);
    if (visual === undefined) {
      // One lookup for the boss flag and all three slots; the removal branch
      // then needs no catalogue at all. Only an enemy has an archetype - a
      // shell or a rock carries no `kind`.
      const archetype =
        entity.visualKind === "enemy"
          ? resolveEnemyVisual(snapshot.enemyCatalogue, entity.kind)
          : undefined;
      const created = createCombatVisual(scene, entity, snapshot, tankLook, bake);
      created.object.setPosition(entity.x, entity.y);
      created.object.rotation = heading;
      visuals.set(entityId, {
        object: created.object,
        healthBar: created.healthBar,
        live: prediction?.bind(entityId, entity.visualKind),
        drawnHealth: entity.visualKind === "enemy" ? entity.hp : 0,
        // An entity appears already formed at the newest tick; there is no
        // earlier authoritative sample to walk it out of.
        position: createPointTrack(entity, toTick),
        angle: createAngleTrack(heading, toTick),
        velocity: reckonableVelocity(entity),
        deathEffect: deathEffectFor(
          entity.visualKind,
          archetype?.isBoss === true,
          archetype?.effects?.death
        ),
        blockEffect:
          entity.visualKind === "projectile" && entity.kind === "hostile"
            ? SHIELD_BLOCK_EFFECT
            : undefined,
        hitEffect: archetype?.effects?.hit,
        shotEffect: archetype?.effects?.shot,
        radius: entity.radius,
        drawnShots: entity.visualKind === "enemy" ? entity.shotsFired : 0,
        hitEffectTick: undefined
      });
      /*
       * A friendly shell appearing is the crew firing, and this is the frame it
       * first exists in. Only the fact is recorded here; where it goes is the
       * scene's to decide from the pose it draws, because the hull on screen is
       * interpolated and the snapshot's is a patch behind it.
       *
       * Silent on a snapping reconcile, or a hydration would flash once for
       * every shell already in the air.
       */
      if (!snap && entity.visualKind === "projectile") {
        const source = "source" in entity ? entity.source : undefined;
        if (source === "cannon" || source === "machineGun") {
          ownShots.push({ source, shellRadius: entity.radius });
        }
      }
    } else {
      // A binding missed at spawn - the sprite made from a view the room had
      // already moved past - would otherwise leave that one entity on the
      // snapshot clock for as long as it lives.
      visual.live ??= prediction?.bind(entityId, entity.visualKind);
      /*
       * The tracks are the fallback's memory, and a bound entity does not use
       * them: it is read from the predictor every frame. Extending them anyway
       * was two allocations and an angle unwrap per entity per patch - work
       * that scales with the wave and is thrown away.
       */
      if (visual.live !== undefined) {
        visual.velocity = reckonableVelocity(entity);
      } else if (snap) {
        visual.object.setPosition(entity.x, entity.y).setRotation(heading);
        visual.position = createPointTrack(entity, toTick);
        visual.angle = createAngleTrack(heading, toTick);
        visual.velocity = reckonableVelocity(entity);
      } else {
        visual.position = extendPointTrack(visual.position, entity, toTick);
        visual.angle = extendAngleTrack(visual.angle, heading, toTick);
        visual.velocity = reckonableVelocity(entity);
      }
      if (entity.visualKind === "enemy" && visual.drawnHealth !== entity.hp) {
        // Only a fall is a hit: a repair or a fresh maximum is not, and the bar
        // is redrawn either way.
        const tookHit = entity.hp < visual.drawnHealth;
        visual.drawnHealth = entity.hp;
        if (visual.healthBar !== undefined) setEnemyHealthBar(visual.healthBar, entity);
        if (
          tookHit &&
          visual.hitEffect !== undefined &&
          mayPlayHitEffect(toTick, visual.hitEffectTick)
        ) {
          visual.hitEffectTick = toTick;
          bursts?.spawn(visual.hitEffect, visual.object.x, visual.object.y, visual.radius);
        }
      }
      if (entity.visualKind === "enemy" && visual.drawnShots !== entity.shotsFired) {
        visual.drawnShots = entity.shotsFired;
        // On the hull and along its heading, which is what the counter buys over
        // naming a shooter on every shell: a muzzle flash that faces the barrel.
        if (visual.shotEffect !== undefined) {
          // At the leading edge of the hull, not at its centre: an enemy's own
          // barrels are not on the snapshot, so the front along its heading is
          // the honest muzzle - and a flash under the hull is a flash nobody
          // sees.
          const bearing = visual.object.rotation;
          bursts?.spawn(
            visual.shotEffect,
            visual.object.x + Math.cos(bearing) * visual.radius,
            visual.object.y + Math.sin(bearing) * visual.radius,
            visual.radius,
            bearing
          );
        }
      }
    }
  }
}

/**
 * A shape drawn once into a texture, and an image of it thereafter.
 *
 * Everything on the field is built from primitives, and every one of them was
 * being tessellated again on every spawn - a wave of shells is a wave of
 * geometry rebuilt from scratch. The reference prototype draws the same
 * primitives, but bakes them at boot (`generateTexture`) and puts an `image`
 * on the field, so a frame costs a transform and nothing else. That is the
 * whole difference between seven milliseconds a second on a hundred and
 * sixty-five bodies and fifteen on three.
 *
 * The key must name everything that changes a pixel - shape, size, colour -
 * because a texture is shared by every entity that asks for the same one.
 * `half` is how far the drawing reaches from its own origin; the box is twice
 * that and the origin sits at its centre, so the image lands exactly where
 * the graphics would have.
 */

/**
 * What a streaming cockpit lends the scene: the frame driver for its own ship,
 * and the world read off that same clock.
 *
 * Every call is allowed to answer "not this one" - the two-device display never
 * has a driver at all, and a sprite whose entity has already left the room has
 * nothing to bind to.
 */
/** Only what the scene draws with; the rest of the pose is the replay's business. */
interface PredictedShipPose {
  readonly x: number;
  readonly y: number;
  readonly heading: number;
  readonly turretAngle: number;
}

export interface ScenePrediction {
  /** Steps and sends, then hands back the pose - or nothing when the switch is off. */
  drive(): PredictedShipPose | undefined;
  bind(entityId: string, kind: LiveEntityKind): LiveEntity | undefined;
  read(entity: LiveEntity): LivePlacement | undefined;
}

/**
 * How long the worst frame is gathered over before it is published. A second,
 * because that is the unit the frame counter beside it already speaks in, and
 * because a shorter window makes the reading flicker faster than it can be
 * read.
 */

/**
 * The velocity a shell may be carried forward by, or nothing.
 *
 * Shells only. An enemy travels an arc under a steering blend that changes
 * every tick, so extrapolating it linearly throws it off the curve and snaps it
 * back; a homing missile steers by definition. Only motion nobody can influence
 * is safe to carry forward - which is the lab's rule, and the reason it reckons
 * its bullets and lerps everything else.
 */
function reckonableVelocity(
  entity: CombatEntity
): { readonly x: number; readonly y: number } | undefined {
  return entity.visualKind === "projectile"
    ? { x: entity.velocityX, y: entity.velocityY }
    : undefined;
}
