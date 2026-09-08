import type { DisplayGameSnapshot } from "@spaceship-defender/protocol";
import Phaser from "phaser";

import { bakeShape } from "../bake.js";
import { FrameMeter } from "./frameMeter.js";
import { AimingLayer } from "./aiming.js";
import { drawArena, drawDecorations } from "./arena.js";
import { CameraFrame } from "./camera.js";
import { createCombatVisual, getEntityHeading, type CombatEntity } from "./entities.js";
import { drawShield } from "./shield.js";
import { drawSpaceshipHull, setEnemyHealthBar, turretMountPoint } from "../entityArt.js";

import {
  advancePlayback,
  createAngleTrack,
  createPlaybackClock,
  createPointTrack,
  createSnappedVisualTransitions,
  extendAngleTrack,
  extendPointTrack,
  observePlaybackTick,
  reconcileStableIds,
  sampleAngleTrack,
  samplePointTrack,
  SnapshotResetLatch,
  type AngleTrack,
  type PlaybackClock,
  type Point,
  type PointTrack
} from "../spaceshipViewModel.js";
import type { LiveEntity, LiveEntityKind, LivePlacement } from "../../model/shipPrediction.js";
import { drawCatalogAssetById } from "../catalogRenderer.js";
import { drawTankHull, drawTankTurret, readTankLook, TANK_ART_HALF } from "../tankArt.js";

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

/** Only what the scene draws with; the rest of the pose is the replay's business. */
interface PredictedShipPose {
  readonly x: number;
  readonly y: number;
  readonly heading: number;
  readonly turretAngle: number;
}

/**
 * What a streaming cockpit lends the scene: the frame driver for its own ship,
 * and the world read off that same clock.
 *
 * Every call is allowed to answer "not this one" - the two-device display never
 * has a driver at all, and a sprite whose entity has already left the room has
 * nothing to bind to.
 */
export interface ScenePrediction {
  /** Steps and sends, then hands back the pose - or nothing when the switch is off. */
  drive(): PredictedShipPose | undefined;
  bind(entityId: string, kind: LiveEntityKind): LiveEntity | undefined;
  read(entity: LiveEntity): LivePlacement | undefined;
}

interface CombatVisual {
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
}

export class SpaceshipScene extends Phaser.Scene {
  private snapshot: DisplayGameSnapshot;
  private spaceshipBody: Phaser.GameObjects.Image | undefined;
  private noseMarker: Phaser.GameObjects.Image | undefined;
  private turret: TurretObject | undefined;
  private shield: Phaser.GameObjects.Image | undefined;
  private visualShieldAngle: number;
  private spaceshipTrack: PointTrack;
  private headingTrack: AngleTrack;
  private turretTrack: AngleTrack;
  private shieldTrack: AngleTrack;
  private playback: PlaybackClock;
  /** Arrival of the last snapshot that carried a new tick, for pace measuring. */
  private lastSnapshotAt: number | undefined;
  private readonly frames = new FrameMeter();
  private readonly snapshotReset = new SnapshotResetLatch();
  private readonly combatVisuals = new Map<string, CombatVisual>();
  /** Off makes the layers invisible and stops their per-frame arithmetic. */
  /**
   * The prototype's picture instead of ours; see `readTankLook`. Read once at
   * construction because it decides what is baked, and a texture is baked once.
   */
  private readonly tankLook = readTankLook(
    (globalThis as { location?: { search?: string } }).location?.search ?? ""
  );
  /**
   * The ship this page is flying, asked for once per drawn frame.
   *
   * Read here rather than handed down as a prop: the pose changes every frame,
   * and a prop would mean a React render every frame - which is the cost this
   * whole exercise is trying to remove.
   */
  private prediction: ScenePrediction | undefined;
  private aiming: AimingLayer | undefined;
  /**
   * Where the newest snapshot is, pulled rather than pushed.
   *
   * The page around the scene commits far more slowly than the room patches,
   * because a React tree rebuilt twenty times a second is most of a phone's
   * frame budget. The world cannot wait for that: a shell has to appear on the
   * patch that spawned it, so the scene reads the wire itself.
   */
  private snapshotSource: (() => DisplayGameSnapshot | undefined) | undefined;
  /**
   * Off stops the five vector overlays that are cleared and rebuilt every frame
   * - the shield sector, the aim envelope, both focus rings and the beams.
   *
   * They are the one thing this display does that the lab does not: it draws
   * its arena once and moves sprites. Rebuilding a path every frame costs
   * tessellation and an upload, and neither gets cheaper at a lower device
   * pixel ratio - which is exactly why `dpr=1` changed nothing.
   */
  private vectorsEnabled = true;
  private readonly camera = new CameraFrame();

  constructor(snapshot: DisplayGameSnapshot) {
    super("spaceship");
    this.snapshot = snapshot;
    this.visualShieldAngle = snapshot.shield.angle;
    const tick = snapshot.tick;
    this.playback = createPlaybackClock(tick);
    this.spaceshipTrack = createPointTrack(snapshot.spaceship, tick);
    this.headingTrack = createAngleTrack(snapshot.spaceship.heading, tick);
    this.turretTrack = createAngleTrack(snapshot.turretAngle, tick);
    this.shieldTrack = createAngleTrack(snapshot.shield.angle, tick);
  }

  create(): void {
    this.camera.configure(
      this,
      this.scale.gameSize.width,
      this.scale.gameSize.height,
      this.snapshot.cameraViewWidth,
      this.snapshot.spaceship
    );
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    });
    this.camera.focusOn(this, this.snapshot.spaceship);
    drawArena(this, this.snapshot, this.tankLook, (key, half, draw) =>
      this.bakedShape(key, half, draw)
    );
    drawDecorations(this, this.snapshot, (key, half, draw) => this.bakedShape(key, half, draw));

    /*
     * The hull and its nose marker are baked for the same reason the enemies
     * are: they are fixed drawings that only ever move and turn, and a
     * `Graphics` object is walked command by command on every frame it is
     * visible, however long ago it was drawn.
     */
    const shipRadius = this.snapshot.spaceship.radius;
    const hullVisual = this.snapshot.spaceshipVisual;
    /*
     * Under `?tanks=1` the prototype's hull, drawn at the art's own size and
     * scaled to the ship: the tank is one fixed drawing, so a bake sized by the
     * hull would clip a small one and pad a large one.
     */
    this.spaceshipBody = this.add
      .image(
        this.snapshot.spaceship.x,
        this.snapshot.spaceship.y,
        this.tankLook
          ? this.bakedShape("tank:hull", TANK_ART_HALF + 6, drawTankHull)
          : this.bakedShape(
              `hull:${hullVisual?.shape ?? "default"}:${String(hullVisual?.modelScale ?? 1)}:${String(Math.round(shipRadius))}`,
              shipRadius * (hullVisual?.modelScale ?? 1) * 1.35 + 6,
              (graphics) => {
                drawSpaceshipHull(graphics, this.snapshot);
              }
            )
      )
      .setScale(this.tankLook ? shipRadius / TANK_ART_HALF : 1)
      .setDepth(10)
      .setRotation(this.snapshot.spaceship.heading);

    this.noseMarker = this.add
      .image(
        this.snapshot.spaceship.x,
        this.snapshot.spaceship.y,
        this.bakedShape(`nose:${String(Math.round(shipRadius))}`, shipRadius + 16, (graphics) => {
          graphics.fillStyle(0xffd36f, 1);
          graphics.fillTriangle(shipRadius - 4, -9, shipRadius + 12, 0, shipRadius - 4, 9);
        })
      )
      .setDepth(11)
      .setRotation(this.snapshot.spaceship.heading);

    /*
     * An empty texture to start on: every drawing below picks its own the first
     * time it has something to show, and an image has to be created with some
     * texture or Phaser puts a green box in its place.
     */
    const blank = this.bakedShape("blank", 1, () => undefined);

    this.turret = createTurret(this, this.snapshot);
    this.shield = this.add.image(0, 0, blank).setDepth(14);
    // Above the arena, below the shield: a pulse is over before it can hide
    // anything that matters.
    this.aiming = new AimingLayer(
      this.add.graphics().setDepth(13),
      // Under everything that matters: it is a hint about where the gun can
      // reach, and it must never sit on top of what is being aimed at.
      this.add.image(0, 0, blank).setDepth(4).setVisible(false),
      // Above the ships it marks, below the shield and the pulses.
      this.add.image(0, 0, blank).setDepth(12).setVisible(false),
      this.add.image(0, 0, blank).setDepth(12).setVisible(false),
      (key, half, draw) => this.bakedShape(key, half, draw)
    );
    const tick = this.snapshot.tick;
    this.snapToSnapshot(this.snapshot, tick);
    this.drawShield();
    this.reconcileCombatVisuals(tick, true);
  }

  override update(time: number, deltaMs: number): void {
    const startedAt = performance.now();
    const pulled = this.snapshotSource?.();
    if (
      pulled !== undefined &&
      (pulled.tick !== this.snapshot.tick ||
        pulled.cameraViewWidth !== this.snapshot.cameraViewWidth)
    ) {
      this.applySnapshot(pulled);
    }
    this.updateScene(time, deltaMs);
    // Everything the scene itself does, told apart from the rest of the frame:
    // a frame can run long because of this, or because of React committing a
    // snapshot beside it, or because the browser rasterised. Only a number says
    // which.
    this.frames.recordUpdate(performance.now() - startedAt);
  }

  private updateScene(time: number, deltaMs: number): void {
    this.frames.recordFrame(time, this.game.loop.rawDelta);
    this.playback = advancePlayback(this.playback, deltaMs);
    if (this.spaceshipBody === undefined || this.turret === undefined || this.shield === undefined)
      return;
    const playbackTick = this.playback.tick;
    /*
     * The predicted ship wins over the interpolated one when there is a
     * prediction, and that is the whole point: interpolation draws where the
     * room said the hull was a patch ago, prediction draws where this page's
     * own step has already put it.
     */
    // First thing in the frame, before anything is read for drawing.
    const predicted = this.prediction?.drive();
    const spaceshipPosition =
      predicted === undefined
        ? samplePointTrack(this.spaceshipTrack, playbackTick)
        : { x: predicted.x, y: predicted.y };
    const spaceshipHeading =
      predicted === undefined
        ? sampleAngleTrack(this.headingTrack, playbackTick)
        : predicted.heading;
    this.spaceshipBody
      .setPosition(spaceshipPosition.x, spaceshipPosition.y)
      .setRotation(spaceshipHeading);
    if (this.noseMarker !== undefined) {
      this.noseMarker
        .setPosition(spaceshipPosition.x, spaceshipPosition.y)
        .setRotation(spaceshipHeading);
    }
    const mount = turretMountPoint(
      { ...spaceshipPosition, radius: this.snapshot.spaceship.radius },
      spaceshipHeading,
      this.snapshot.turretVisual
    );
    this.turret.setPosition(mount.x, mount.y);
    this.turret.rotation =
      predicted === undefined
        ? sampleAngleTrack(this.turretTrack, playbackTick)
        : predicted.turretAngle;
    this.visualShieldAngle = sampleAngleTrack(this.shieldTrack, playbackTick);
    if (this.vectorsEnabled) {
      this.drawShield();
      // From the mount, which is where the simulation fires from too: the barrel
      // a crew sees is the barrel that shoots, so the envelope and the ring start
      // on it rather than at the hull's centre.
      this.aiming?.drawEnvelope(mount, this.turret.rotation, this.snapshot, this.vectorsEnabled);
      // One list, both rings: they ask the same question of the same ships, and
      // building it twice was two objects per enemy per frame of pure garbage.
      const candidates =
        this.aiming?.updateCandidates(this.snapshot, (entityId) =>
          this.readDrawnPoint(entityId, playbackTick)
        ) ?? [];
      this.aiming?.drawFocusRing(
        mount,
        this.turret.rotation,
        candidates,
        this.snapshot,
        this.vectorsEnabled,
        this.time.now
      );
      this.aiming?.drawNoseFocus(
        spaceshipPosition,
        spaceshipHeading,
        candidates,
        this.snapshot,
        this.vectorsEnabled
      );
      this.aiming?.drawBeams(this.snapshot);
    }
    this.camera.focusOn(this, spaceshipPosition);

    /*
     * How far behind the newest snapshot the playback clock is running, in
     * seconds. Shells are carried forward by exactly this much - to server
     * present, never past it, so nothing is invented.
     */
    const behindSeconds =
      Math.max(0, this.playback.latestTick - playbackTick) * (this.playback.msPerTick / 1000);
    let liveDrawn = 0;
    let offscreen = 0;
    const camera = this.cameras.main;
    const viewLeft = camera.scrollX;
    const viewTop = camera.scrollY;
    const renderer = this.camera.readRendererSize();
    const viewRight = viewLeft + renderer.width;
    const viewBottom = viewTop + renderer.height;
    for (const visual of this.combatVisuals.values()) {
      /*
       * One clock for the whole picture when there is a cockpit driving it.
       *
       * The predictor smooths and reckons every entity it was given, so reading
       * through it puts the world where the ship already is. Without one - the
       * shared display, the preview - the tracks below still do the job they
       * always did.
       */
      const live = visual.live === undefined ? undefined : this.prediction?.read(visual.live);
      if (live !== undefined) {
        liveDrawn += 1;
        visual.object.setPosition(live.x, live.y);
        visual.object.rotation = live.rotation;
        if (visual.healthBar !== undefined) visual.healthBar.rotation = -visual.object.rotation;
        continue;
      }
      const sampled = samplePointTrack(visual.position, playbackTick);
      const carried =
        visual.velocity === undefined || behindSeconds === 0
          ? sampled
          : {
              x: sampled.x + visual.velocity.x * behindSeconds,
              y: sampled.y + visual.velocity.y * behindSeconds
            };
      visual.object.setPosition(carried.x, carried.y);
      visual.object.rotation = sampleAngleTrack(visual.angle, playbackTick);
      // Keep the bar level while the hull it belongs to turns.
      if (visual.healthBar !== undefined) visual.healthBar.rotation = -visual.object.rotation;
    }
    for (const visual of this.combatVisuals.values()) {
      const { x, y } = visual.object;
      if (x < viewLeft || x > viewRight || y < viewTop || y > viewBottom) offscreen += 1;
    }
    this.frames.recordDrawn(liveDrawn, offscreen);
  }

  readAverageFrameMs(): number {
    return this.frames.readAverageFrameMs();
  }

  readWorstFrameMs(): number {
    return this.frames.readWorstFrameMs();
  }

  readStutterShare(): number {
    return this.frames.readStutterShare();
  }

  readUpdateMsPerSecond(): number {
    return this.frames.readUpdateMsPerSecond();
  }

  readWorstUpdateMs(): number {
    return this.frames.readWorstUpdateMs();
  }

  readLiveDrawnCount(): number {
    return this.frames.readLiveDrawnCount();
  }

  readOffscreenCount(): number {
    return this.frames.readOffscreenCount();
  }

  applySnapshot(snapshot: DisplayGameSnapshot): void {
    const framedWidth = this.snapshot.cameraViewWidth;
    const previousTick = this.snapshot.tick;
    this.snapshot = snapshot;
    const shouldSnap = this.snapshotReset.consumeForSnapshot();
    if (!this.sys.isActive()) return;
    // The framed slice comes from the balance preset, so a new run - or a
    // preview slider - can widen it while the scene keeps running.
    if (snapshot.cameraViewWidth !== framedWidth) {
      this.camera.reconfigure(
        this,
        snapshot.cameraViewWidth,
        this.spaceshipBody ?? snapshot.spaceship
      );
    }
    if (shouldSnap || this.spaceshipBody === undefined || this.turret === undefined) {
      this.snapToSnapshot(snapshot, snapshot.tick);
      // The measured pace survives a hydration: the room did not change its
      // rate just because this client lost the thread of it.
      this.playback = createPlaybackClock(snapshot.tick, this.playback.msPerTick);
      this.lastSnapshotAt = performance.now();
      this.reconcileCombatVisuals(snapshot.tick, true);
      return;
    }
    // A patch with no new tick - telemetry, an offer, a reframed camera -
    // carries no movement, so restarting a segment on it would only nudge the
    // world sideways.
    if (snapshot.tick === previousTick) return;
    const arrivedAt = performance.now();
    const gapMs = this.lastSnapshotAt === undefined ? 0 : arrivedAt - this.lastSnapshotAt;
    this.lastSnapshotAt = arrivedAt;
    this.playback = observePlaybackTick(this.playback, snapshot.tick, gapMs);
    // Segments run authoritative sample to authoritative sample, and the track
    // keeps the displaced one, so playback - which deliberately runs behind -
    // always has a segment under it to draw.
    this.spaceshipTrack = extendPointTrack(this.spaceshipTrack, snapshot.spaceship, snapshot.tick);
    this.headingTrack = extendAngleTrack(
      this.headingTrack,
      snapshot.spaceship.heading,
      snapshot.tick
    );
    this.turretTrack = extendAngleTrack(this.turretTrack, snapshot.turretAngle, snapshot.tick);
    this.shieldTrack = extendAngleTrack(this.shieldTrack, snapshot.shield.angle, snapshot.tick);
    this.reconcileCombatVisuals(snapshot.tick, false);
  }

  prepareHydration(): void {
    for (const visual of this.combatVisuals.values()) visual.object.destroy();
    this.combatVisuals.clear();
    this.snapshotReset.request();
  }

  /**
   * The floor, baked once instead of re-tessellated sixty times a second.
   *
   * A profile of a throttled fight put Phaser's graphics renderer, its batcher
   * and the polygon tessellator at two thirds of the main thread, and the arena
   * is the largest single drawing on the field: a filled circle four thousand
   * units across, a rim band, five rings and twelve spokes, every command of it
   * walked again on every frame because that is what a `Graphics` object is.
   *
   * As a texture it is four vertices. The bake happens in texture space and the
   * image is stretched back to world size, which is why every width below is
   * multiplied: a two-unit ring drawn at texture scale comes back two units
   * wide on the floor. Curves and flat fills carry that stretch without
   * showing it; that is the whole reason this shape can be baked and the shield
   * cannot.
   */
  /**
   * The floor. Ours by default, the prototype's under `?tanks=1`.
   *
   * Both are baked at a fixed resolution and stretched to the arena, and both
   * divide their line widths by that stretch: an image drawn at two thousand
   * pixels and shown at four thousand units returns a line twice as thick as it
   * was written.
   */
  setVectorsEnabled(enabled: boolean): void {
    this.vectorsEnabled = enabled;
    this.shield?.setVisible(enabled);
    this.aiming?.setVisible(enabled);
  }

  /**
   * The prediction, driven from inside the frame that draws it.
   *
   * The order is fixed and it is not ours: ask how many fixed steps are due,
   * send exactly that many input frames, and only then read the pose. Running
   * that loop in an animation frame of its own - which is what this was at
   * first - leaves the scene reading a pose staged one callback earlier, and
   * one step stale is precisely what a hand reads as stutter.
   */
  setPredictionDriver(prediction: ScenePrediction | undefined): void {
    this.prediction = prediction;
  }

  setSnapshotSource(read: (() => DisplayGameSnapshot | undefined) | undefined): void {
    this.snapshotSource = read;
  }

  /** Where an enemy is drawn right now: the predictor when there is one, the track when there is not. */
  private readDrawnPoint(entityId: string, playbackTick: number): Point | undefined {
    const visual = this.combatVisuals.get(entityId);
    if (visual === undefined) return undefined;
    if (visual.live !== undefined) return visual.object;
    return samplePointTrack(visual.position, playbackTick);
  }

  private drawShield(): void {
    if (this.shield === undefined || this.spaceshipBody === undefined) return;
    drawShield(
      this.shield,
      this.spaceshipBody,
      this.snapshot,
      this.visualShieldAngle,
      this.vectorsEnabled,
      (key, half, draw) => this.bakedShape(key, half, draw)
    );
  }

  private snapToSnapshot(snapshot: DisplayGameSnapshot, tick: number): void {
    if (this.spaceshipBody === undefined || this.turret === undefined) return;
    this.spaceshipBody.setPosition(snapshot.spaceship.x, snapshot.spaceship.y);
    if (this.noseMarker !== undefined) {
      this.noseMarker
        .setPosition(snapshot.spaceship.x, snapshot.spaceship.y)
        .setRotation(snapshot.spaceship.heading);
    }
    const snappedMount = turretMountPoint(
      snapshot.spaceship,
      snapshot.spaceship.heading,
      snapshot.turretVisual
    );
    this.turret.setPosition(snappedMount.x, snappedMount.y);
    this.turret.setRotation(snapshot.turretAngle);
    this.visualShieldAngle = snapshot.shield.angle;
    const tracks = createSnappedVisualTransitions(snapshot, tick);
    this.spaceshipTrack = tracks.spaceship;
    this.headingTrack = createAngleTrack(snapshot.spaceship.heading, tick);
    this.turretTrack = tracks.turret;
    this.shieldTrack = tracks.shield;
  }

  /**
   * Told, not derived: the factory owns the ratio because it owns the buffer,
   * and a scene that recomputed it would be a second opinion about one number.
   */
  setPixelRatio(ratio: number): void {
    this.camera.setPixelRatio(ratio);
  }

  private readonly handleResize = (gameSize: Phaser.Structs.Size): void => {
    this.camera.configure(
      this,
      gameSize.width,
      gameSize.height,
      this.snapshot.cameraViewWidth,
      this.spaceshipBody ?? this.snapshot.spaceship
    );
  };

  private reconcileCombatVisuals(toTick: number, snap: boolean): void {
    const incoming = collectCombatEntities(this.snapshot);
    const incomingById = new Map(incoming.map((entity) => [entity.entityId, entity]));
    const plan = reconcileStableIds(this.combatVisuals.keys(), incomingById.keys());
    for (const entityId of plan.remove) {
      this.combatVisuals.get(entityId)?.object.destroy();
      this.combatVisuals.delete(entityId);
    }
    for (const entityId of [...plan.create, ...plan.update]) {
      const entity = incomingById.get(entityId);
      if (entity === undefined) continue;
      const heading = getEntityHeading(entity);
      const visual = this.combatVisuals.get(entityId);
      if (visual === undefined) {
        const created = createCombatVisual(
          this,
          entity,
          this.snapshot,
          this.tankLook,
          (key, half, draw) => this.bakedShape(key, half, draw)
        );
        created.object.setPosition(entity.x, entity.y);
        created.object.rotation = heading;
        this.combatVisuals.set(entityId, {
          object: created.object,
          healthBar: created.healthBar,
          live: this.prediction?.bind(entityId, entity.visualKind),
          drawnHealth: entity.visualKind === "enemy" ? entity.hp : 0,
          // An entity appears already formed at the newest tick; there is no
          // earlier authoritative sample to walk it out of.
          position: createPointTrack(entity, toTick),
          angle: createAngleTrack(heading, toTick),
          velocity: reckonableVelocity(entity)
        });
      } else {
        // A binding missed at spawn - the sprite made from a view the room had
        // already moved past - would otherwise leave that one entity on the
        // snapshot clock for as long as it lives.
        visual.live ??= this.prediction?.bind(entityId, entity.visualKind);
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
        if (
          visual.healthBar !== undefined &&
          entity.visualKind === "enemy" &&
          visual.drawnHealth !== entity.hp
        ) {
          visual.drawnHealth = entity.hp;
          setEnemyHealthBar(visual.healthBar, entity);
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
   * Side of the baked arena floor, in texture pixels.
   *
   * Sixteen megabytes of video memory for a drawing that would otherwise be
   * rebuilt every frame. Halving it would blur the two-unit rings past reading
   * once the image is stretched to four thousand units; doubling it buys
   * nothing the camera can show.
   */

  /**
   * Side of the baked aiming wedge, in texture pixels.
   *
   * Stretched to the barrel's reach, so this is resolution and not size. Five
   * hundred and twelve over a nine-hundred unit reach is under two units a
   * pixel on a shape with no detail finer than its own edge.
   */

  private bakedShape(
    key: string,
    half: number,
    draw: (graphics: Phaser.GameObjects.Graphics) => void
  ): string {
    return bakeShape(this, key, half, draw);
  }
}

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
type TurretObject = Phaser.GameObjects.Components.Transform &
  Phaser.GameObjects.GameObject & { rotation: number };

/**
 * The gun sits on top of the hull and turns with the turret angle. A chosen
 * asset is drawn centred on the ship, since that is where the mount is; without
 * one the old bar keeps its off-centre pivot so it still reads as a barrel.
 */

function createTurret(scene: Phaser.Scene, snapshot: DisplayGameSnapshot): TurretObject {
  const visual = snapshot.turretVisual;
  if (visual === null) {
    return scene.add
      .rectangle(snapshot.spaceship.x, snapshot.spaceship.y, 92, 16, 0xffd36f)
      .setOrigin(0.16, 0.5)
      .setDepth(12)
      .setRotation(snapshot.turretAngle);
  }

  // The drawing is offset inside a container so the container itself still
  // turns about the ship's centre: nudging the asset must move the gun, never
  // the point it spins around.
  const tankLook = readTankLook(
    (globalThis as { location?: { search?: string } }).location?.search ?? ""
  );

  const gun = scene.add
    .image(
      0,
      0,
      tankLook
        ? bakeShape(scene, "tank:turret", TANK_ART_HALF + 24, drawTankTurret)
        : bakeShape(
            scene,
            `turret:${visual.shape}:${String(visual.modelScale)}:${String(Math.round(snapshot.spaceship.radius))}`,
            snapshot.spaceship.radius * visual.modelScale * 1.6 + 6,
            (graphics) => {
              drawCatalogAssetById(
                graphics,
                visual.shape,
                snapshot.spaceship.radius * visual.modelScale
              );
            }
          )
    )
    // Where the prototype mounts it: a third along the sprite, so the barrel
    // turns about the mantlet rather than about its own middle.
    .setOrigin(tankLook ? 0.32 : 0.5, 0.5)
    .setScale(tankLook ? snapshot.spaceship.radius / TANK_ART_HALF : 1);
  gun.setPosition(
    visual.pivotX * snapshot.spaceship.radius,
    visual.pivotY * snapshot.spaceship.radius
  );
  const mount = turretMountPoint(snapshot.spaceship, snapshot.spaceship.heading, visual);
  return scene.add
    .container(mount.x, mount.y, [gun])
    .setDepth(12)
    .setRotation(snapshot.turretAngle);
}
