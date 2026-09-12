import type { DisplayGameSnapshot } from "@spaceship-defender/protocol";
import Phaser from "phaser";

import { bakeShape } from "../bake.js";
import { FrameMeter } from "./frameMeter.js";
import { AimingLayer } from "./aiming.js";
import { arenaZoneSignature, drawArena, drawArenaZones, drawDecorations } from "./arena.js";
import { ArenaFleet } from "./arenaFleet.js";
import { CameraFrame } from "./camera.js";
import { createTurret, snapShipToSnapshot, type TurretObject } from "./ship.js";
import { reconcileCombatVisuals, type CombatVisual, type ScenePrediction } from "./entities.js";
import { ShieldLayer } from "./shield.js";
import { BurstLayer, placeOwnShots, type OwnShot } from "./bursts.js";
import { ExhaustLayer } from "./exhaust.js";
import { drawSpaceshipHull, turretMountPoint } from "../entityArt.js";

import { type Point } from "../spaceshipViewModel.js";
import {
  advancePlayback,
  createAngleTrack,
  createPlaybackClock,
  createPointTrack,
  extendAngleTrack,
  extendPointTrack,
  observePlaybackTick,
  sampleAngleTrack,
  samplePointTrack,
  SnapshotResetLatch,
  type AngleTrack,
  type PlaybackClock,
  type PointTrack
} from "../playback.js";
import { drawTankHull, readTankLook, TANK_ART_HALF } from "../tankArt.js";

export class SpaceshipScene extends Phaser.Scene {
  private snapshot: DisplayGameSnapshot;
  private spaceshipBody: Phaser.GameObjects.Image | undefined;
  private noseMarker: Phaser.GameObjects.Image | undefined;
  private turret: TurretObject | undefined;
  private shield: ShieldLayer | undefined;
  private exhaust: ExhaustLayer | undefined;
  private bursts: BurstLayer | undefined;
  /** Shots the crew fired since the last frame, placed from the drawn pose. */
  private readonly ownShots: OwnShot[] = [];
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
  /** Bound once so a layer can hold it; the scene is the texture cache. */
  private readonly bake = (
    key: string,
    half: number,
    draw: (graphics: Phaser.GameObjects.Graphics) => void
  ): string => bakeShape(this, key, half, draw);

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
    drawArena(this, this.snapshot, this.tankLook, (key, half, draw) => this.bake(key, half, draw));
    this.zoneLayer = drawArenaZones(this, this.snapshot, (key, half, draw) =>
      this.bake(key, half, draw)
    );
    drawDecorations(this, this.snapshot, this.bake);

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
          ? this.bake("tank:hull", TANK_ART_HALF + 6, drawTankHull)
          : this.bake(
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
        this.bake(`nose:${String(Math.round(shipRadius))}`, shipRadius + 16, (graphics) => {
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
    const blank = this.bake("blank", 1, () => undefined);

    this.exhaust = new ExhaustLayer(this);
    this.bursts = new BurstLayer(this);
    this.turret = createTurret(this, this.snapshot);
    this.shield = new ShieldLayer(this, blank, this.bake, this.snapshot.shieldBandEffect);
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
      this.bake
    );
    const tick = this.snapshot.tick;
    this.snapToSnapshot(this.snapshot, tick);
    this.drawShield();
    this.reconcile(tick, true);
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
    // Behind the hull, from the drawn pose: the plume has to sit on the ship the
    // crew sees, not on the one the last patch described.
    this.exhaust?.update(spaceshipPosition, spaceshipHeading, this.snapshot);
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
    // From the numbers just drawn, not from the snapshot: that is what keeps the
    // flash on the visible barrel however fast the hull is moving.
    placeOwnShots(this.bursts, this.ownShots, {
      mount,
      hull: spaceshipPosition,
      heading: spaceshipHeading,
      turretRotation: this.turret.rotation,
      hullRadius: this.snapshot.spaceship.radius,
      turretMuzzleEffect: this.snapshot.shipMuzzleEffect
    });
    this.visualShieldAngle = sampleAngleTrack(this.shieldTrack, playbackTick);
    /*
     * The rest of a match, on the clock the rest of the world is drawn on, and
     * the player's own hull on the pose just drawn above. Here rather than at
     * the top of the frame because that pose is what its bars hang from, and
     * before it existed they hung from the last patch and twitched against the
     * ship they belong to.
     */
    this.fleet.update(
      playbackTick,
      deltaMs,
      {
        x: spaceshipPosition.x,
        y: spaceshipPosition.y,
        heading: spaceshipHeading,
        turretAngle: this.turret.rotation,
        shieldAngle: this.visualShieldAngle
      },
      this.prediction
    );
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
     * How far behind the newest snapshot playback is meant to run, in seconds.
     * Shells are carried forward by exactly this much - to server present,
     * never past it, so nothing is invented.
     *
     * The lag the clock decided on rather than the gap this frame happens to
     * show. The newest tick arrives two at a time thirty times a second while
     * playback advances every frame, so the instantaneous difference sawtooths
     * between a patch and the next: subtracting it from a shell that is already
     * being interpolated forward cancels most of the motion and then returns it
     * in a lurch. Measured on the stand, a shell drawn from the raw difference
     * stepped 4 to 6 units a frame and then 20 or 30, at 2.21 times the spread
     * of its own interpolated track.
     */
    const behindSeconds = (this.playback.lagTicks * this.playback.msPerTick) / 1000;
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

  /** The scene's own stopwatch, for whoever publishes its numbers. */
  readFrames(): FrameMeter {
    return this.frames;
  }

  /** The baked zone sheet, replaced whenever a zone changes state. */
  private zoneLayer: Phaser.GameObjects.Image | undefined;
  /** The other hulls of a match; empty in the campaign, which has one ship. */
  private readonly fleet = new ArenaFleet();

  applySnapshot(snapshot: DisplayGameSnapshot): void {
    const framedWidth = this.snapshot.cameraViewWidth;
    const previousTick = this.snapshot.tick;
    const zoneSignature = arenaZoneSignature(this.snapshot);
    this.snapshot = snapshot;
    const shouldSnap = this.snapshotReset.consumeForSnapshot();
    if (!this.sys.isActive()) return;
    // Sixteen hulls, moved rather than rebuilt: the textures are shared and a
    // frame costs a position and two rotations each.
    this.fleet.sync(
      this,
      snapshot,
      (key, half, draw) => this.bake(key, half, draw),
      shouldSnap,
      this.prediction,
      this.bursts
    );
    // The sheet is ground: redrawn when a zone changes state and at no other
    // time, which on a sixty-hertz patch stream is a handful of times a match.
    if (arenaZoneSignature(snapshot) !== zoneSignature) {
      this.zoneLayer?.destroy();
      this.zoneLayer = drawArenaZones(this, snapshot, (key, half, draw) =>
        this.bake(key, half, draw)
      );
    }
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
      this.reconcile(snapshot.tick, true);
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
    this.reconcile(snapshot.tick, false);
  }

  prepareHydration(): void {
    for (const visual of this.combatVisuals.values()) visual.object.destroy();
    this.combatVisuals.clear();
    this.snapshotReset.request();
  }

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
    this.shield.draw(
      this.spaceshipBody,
      this.snapshot,
      this.visualShieldAngle,
      this.vectorsEnabled
    );
  }

  private snapToSnapshot(snapshot: DisplayGameSnapshot, tick: number): void {
    if (this.spaceshipBody === undefined || this.turret === undefined) return;
    const tracks = snapShipToSnapshot(
      { body: this.spaceshipBody, nose: this.noseMarker, turret: this.turret },
      snapshot,
      tick
    );
    this.visualShieldAngle = snapshot.shield.angle;
    this.spaceshipTrack = tracks.spaceship;
    this.headingTrack = tracks.heading;
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

  private reconcile(toTick: number, snap: boolean): void {
    reconcileCombatVisuals({
      scene: this,
      visuals: this.combatVisuals,
      snapshot: this.snapshot,
      prediction: this.prediction,
      tankLook: this.tankLook,
      bake: this.bake,
      toTick,
      snap,
      bursts: this.bursts,
      ownShots: this.ownShots,
      shieldPose: this.shield?.pose()
    });
  }
}
