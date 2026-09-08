import {
  CAMERA_VIEW_ASPECT,
  ENEMY_BEAM_SOURCE,
  FALLBACK_VISUAL_ASSET_ID,
  getVisualAsset
} from "@spaceship-defender/protocol";
import type {
  DisplayGameSnapshot,
  PublicAsteroidView,
  PublicLootDropView,
  PublicEnemyCatalogueEntry,
  PublicEnemyView,
  PublicHomingMissileView,
  PublicProjectileView
} from "@spaceship-defender/protocol";
import Phaser from "phaser";

import {
  advancePlayback,
  backgroundTileOffset,
  createAngleTrack,
  createPlaybackClock,
  createPointTrack,
  createSnappedVisualTransitions,
  extendAngleTrack,
  extendPointTrack,
  fillFocusCandidates,
  getArenaRingRadii,
  getArenaSpokes,
  getRimBandStroke,
  BACKGROUND_COVER_MARGIN_PX,
  getBackgroundCoverRect,
  getBackingStoreSize,
  getPhaserCameraScroll,
  getResponsiveViewport,
  getShieldArcRange,
  getShieldCrescentPoints,
  getShieldDashSegments,
  getShieldVisualStyle,
  observePlaybackTick,
  reconcileStableIds,
  sampleAngleTrack,
  samplePointTrack,
  SnapshotResetLatch,
  type AngleTrack,
  type BackgroundCoverRect,
  type MutableFocusCandidate,
  type PlaybackClock,
  type Point,
  type PointTrack
} from "./spaceshipViewModel.js";
import { watchDevicePixelRatio } from "./devicePixels.js";
import type { LiveEntity, LiveEntityKind, LivePlacement } from "../model/shipPrediction.js";
import { pickFocusedTarget } from "../combatFocus.js";
import { drawCatalogAsset, drawCatalogAssetById } from "./catalogRenderer.js";
import {
  drawEnemyTank,
  drawTankArena,
  drawTankArenaRim,
  drawTankHull,
  drawTankTurret,
  ENEMY_ART_HALF,
  readTankLook,
  TANK_ART_HALF,
  TANK_VOID_COLOR
} from "./tankArt.js";
import {
  BACKGROUND_LAYERS,
  BACKGROUND_LAYER_DEPTH,
  BACKGROUND_TEXTURE_KEYS,
  backgroundLayerAlpha,
  backgroundTextureKey,
  isNebulaLayer,
  type BackgroundBlendMode,
  type BackgroundLayerConfig
} from "./spaceBackground.js";

/**
 * What the viewport spec reads: the camera's pixel rect and its zoom, both in
 * the pixels the scene draws into rather than the CSS pixels the page is laid
 * out in. The two differ by `pixelRatio` on a dense panel, and the slice of
 * world - `width / zoom` - is the same number either way, which is the point.
 */
interface DisplayCameraSlice {
  readonly width: number;
  readonly height: number;
  readonly zoom: number;
  readonly pixelRatio: number;
  /** The whole glass, letterbox bars included. */
  readonly canvasWidth: number;
  readonly canvasHeight: number;
}

const BASE_VIEWPORT_WIDTH = 1600;
const BASE_VIEWPORT_HEIGHT = 900;
const OUTSIDE_SPACE_COLOR = 0x02070d;
/** Drawn when a preset picks no hull of its own. */
const DEFAULT_SPACESHIP_HULL_ASSET_ID = "ship-dart";
const ARENA_SPACE_COLOR = 0x07171f;
/** The elastic rim band: visible enough to read as ground, not as an object. */
const RIM_BAND_COLOR = 0xf2c14e;
const RIM_BAND_ALPHA = 0.12;
/** The parallax background shows through the arena disc. */
const ARENA_FILL_ALPHA = 0.5;

/**
 * How long the worst frame is gathered over before it is published. A second,
 * because that is the unit the frame counter beside it already speaks in, and
 * because a shorter window makes the reading flicker faster than it can be
 * read.
 */
/**
 * How much longer than the shortest frame of the window a frame has to run
 * before it counts as a stutter. Half again: a frame that misses its slot and
 * waits for the next one is a full double, so this catches a dropped frame with
 * room to spare and ignores the ordinary jitter of a busy compositor.
 */
const STUTTER_RATIO = 1.5;
const FRAME_WINDOW_MS = 1000;

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

interface BackgroundLayerState {
  readonly sprite: Phaser.GameObjects.TileSprite;
  readonly config: BackgroundLayerConfig;
}

type CombatEntity =
  | (PublicEnemyView & { readonly visualKind: "enemy" })
  | (PublicAsteroidView & { readonly visualKind: "asteroid" })
  | (PublicLootDropView & { readonly visualKind: "loot" })
  | (PublicProjectileView & { readonly visualKind: "projectile" })
  | (PublicHomingMissileView & { readonly visualKind: "missile" });

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

class SpaceshipScene extends Phaser.Scene {
  private snapshot: DisplayGameSnapshot;
  private spaceshipBody: Phaser.GameObjects.Image | undefined;
  private noseMarker: Phaser.GameObjects.Image | undefined;
  private turret: TurretObject | undefined;
  private shield: Phaser.GameObjects.Image | undefined;
  private beams: Phaser.GameObjects.Graphics | undefined;
  private aimEnvelope: Phaser.GameObjects.Image | undefined;
  private focusRing: Phaser.GameObjects.Image | undefined;
  /** What the ring held last frame, so it does not jump on every wobble. */
  private focusedEntityId: string | undefined;
  private noseFocus: Phaser.GameObjects.Image | undefined;
  private noseFocusedEntityId: string | undefined;
  private visualShieldAngle: number;
  private spaceshipTrack: PointTrack;
  private headingTrack: AngleTrack;
  private turretTrack: AngleTrack;
  private shieldTrack: AngleTrack;
  private playback: PlaybackClock;
  /** Arrival of the last snapshot that carried a new tick, for pace measuring. */
  private lastSnapshotAt: number | undefined;
  /**
   * The longest frame of the last completed second, in milliseconds.
   *
   * The frame counter beside it is an average smoothed across seconds, so one
   * stalled frame never moves it at all - and a stall is precisely what a
   * player calls a freeze. This is the other half of the same question, and it
   * is collected here because the scene is the only thing that sees every
   * frame.
   */
  private worstFrameMs = 0;
  private frameWindowWorstMs = 0;
  private frameWindowEndsAt = 0;
  /*
   * Smoothness, which the two numbers above cannot show between them. An
   * average says whether the scene keeps up and the worst frame says whether it
   * stopped; neither says whether it is *even*. Thirty frames of 16 ms and
   * thirty of 33 average to a healthy 45 and hide a picture that judders the
   * whole way.
   *
   * A stutter here is a frame that took half again as long as the shortest one
   * this window. The shortest is the display's own cadence — it is the one
   * figure a stall cannot inflate — so the measure calibrates itself to 60 Hz,
   * 120 Hz or a throttled tab without being told which.
   */
  private stutterShare = 0;
  /** Milliseconds a second the scene spends in its own update, and the worst one. */
  private updateMsPerSecond = 0;
  private worstUpdateMs = 0;
  private frameWindowUpdateMs = 0;
  private frameWindowWorstUpdateMs = 0;
  private frameWindowFrames = 0;
  private frameWindowStutters = 0;
  private frameWindowShortestMs = Number.POSITIVE_INFINITY;
  private frameWindowTotalMs = 0;
  /**
   * The average frame of the last second.
   *
   * Beside the worst on purpose: a rate says how many frames arrived, the worst
   * says whether one of them was late, and only the mean says whether the whole
   * second was heavy or one moment in it was.
   */
  private averageFrameMs = 0;
  private readonly snapshotReset = new SnapshotResetLatch();
  private readonly combatVisuals = new Map<string, CombatVisual>();
  /** Reused between frames; see `updateFocusCandidates`. */
  private readonly focusScratch: MutableFocusCandidate[] = [];
  private readonly backgroundLayers: BackgroundLayerState[] = [];
  /** Off makes the layers invisible and stops their per-frame arithmetic. */
  /**
   * Off, and not merely hidden: four full-screen tile sprites, three of them
   * blended, measured forty-three points of torn frames on a tablet - the
   * largest single thing on the field by a distance. Nothing creates them until
   * the switch in the instrument panel asks for them.
   */
  private backgroundEnabled = false;
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
  /** The geometry and state the shield arc was last built for. */
  private shieldShape:
    { readonly radius: number; readonly half: number; readonly active: boolean } | undefined;
  /** Reused points for the shield's crescent; refilled, never rebuilt. */
  private readonly shieldPoints: Phaser.Math.Vector2[] = [];
  /** The reach and cone the aiming wedge was last built for. */
  private aimEnvelopeShape: { readonly reach: number; readonly half: number } | undefined;
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
   * How many drawn entities came off the predictor last frame.
   *
   * The instrument that tells a working port from a silent fallback: the read
   * path degrades quietly by design, so without a count on screen a world still
   * being drawn from twenty-hertz snapshots looks exactly like one that is not.
   */
  private liveDrawnCount = 0;
  /**
   * How many drawn entities sat outside the camera last frame.
   *
   * The measurement an area filter has to earn its keep against: this cockpit
   * shows a good part of the arena, so the share the room could stop sending is
   * a number to read before it is a change to make.
   */
  private offscreenCount = 0;
  /**
   * Off keeps the shield's bloom down even while the sector is up.
   *
   * The filter is already the cheap kind - internal, on the arc's own target
   * rather than the whole canvas - but "already cheap" is a claim, and the only
   * way to price the remainder on a phone is to take it away there.
   */
  private glowEnabled = true;
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
  private parallaxStrength = 1;
  /** Accumulated idle-drift time in seconds, already scaled by the tuned drift speed. */
  private backgroundDriftSeconds = 0;
  private viewportWidth = BASE_VIEWPORT_WIDTH;
  private viewportHeight = BASE_VIEWPORT_HEIGHT;
  private backgroundCover: BackgroundCoverRect = getBackgroundCoverRect(
    BASE_VIEWPORT_WIDTH,
    BASE_VIEWPORT_HEIGHT,
    1
  );
  /**
   * Device pixels per CSS pixel, handed in by whoever sized the buffer. Only
   * the numbers measured in absolute pixels care - the background's cover
   * margin - because everything else is world space multiplied by the camera
   * zoom, and the zoom scaled with the buffer.
   */
  private pixelRatio = 1;
  /** The glass, in the same pixels the scene draws into. */
  private canvasWidth = BASE_VIEWPORT_WIDTH;
  private canvasHeight = Math.round(BASE_VIEWPORT_WIDTH * CAMERA_VIEW_ASPECT);
  /** The camera's own pixel rect, which is the frame centred inside the glass. */
  private rendererWidth = BASE_VIEWPORT_WIDTH;
  private rendererHeight = BASE_VIEWPORT_HEIGHT;

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

  preload(): void {
    // All six PNGs up front so a nebula preset switch is an instant setTexture.
    for (const key of BACKGROUND_TEXTURE_KEYS) {
      this.load.image(key, `textures/${key.replace(/^bg-/, "")}.png`);
    }
  }

  create(): void {
    this.configureViewport(this.scale.gameSize.width, this.scale.gameSize.height);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    });
    this.focusCamera(this.snapshot.spaceship);
    this.drawArena();
    if (this.backgroundEnabled) this.createBackground(this.snapshot.background);
    this.drawDecorations();

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
    this.beams = this.add.graphics().setDepth(13);
    // Under everything that matters: it is a hint about where the gun can
    // reach, and it must never sit on top of what is being aimed at.
    this.aimEnvelope = this.add.image(0, 0, blank).setDepth(4).setVisible(false);
    // Above the ships it marks, below the shield and the pulses.
    this.focusRing = this.add.image(0, 0, blank).setDepth(12).setVisible(false);
    this.noseFocus = this.add.image(0, 0, blank).setDepth(12).setVisible(false);
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
    const spent = performance.now() - startedAt;
    this.frameWindowUpdateMs += spent;
    if (spent > this.frameWindowWorstUpdateMs) this.frameWindowWorstUpdateMs = spent;
  }

  private updateScene(time: number, deltaMs: number): void {
    this.recordFrameTime(time);
    this.updateBackground(deltaMs);
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
      this.drawAimEnvelope(mount, this.turret.rotation);
      // One list, both rings: they ask the same question of the same ships, and
      // building it twice was two objects per enemy per frame of pure garbage.
      const candidates = this.updateFocusCandidates(playbackTick);
      this.drawFocusRing(mount, this.turret.rotation, candidates);
      this.drawNoseFocus(spaceshipPosition, spaceshipHeading, candidates);
      this.drawLaserBeams();
    }
    this.focusCamera(spaceshipPosition);

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
    const viewRight = viewLeft + this.rendererWidth;
    const viewBottom = viewTop + this.rendererHeight;
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
    this.liveDrawnCount = liveDrawn;
    this.offscreenCount = offscreen;
  }

  /**
   * Keeps the worst frame of the running second, and publishes it when the
   * second is over.
   *
   * `rawDelta` rather than the smoothed delta the scene is handed: the
   * smoothing is what makes the average readable, and it is exactly what would
   * hide the spike. Published only on a closed window, so the number does not
   * change underneath a sampler that reads it twice a second.
   */
  private recordFrameTime(time: number): void {
    if (this.frameWindowEndsAt === 0) {
      // The first frame carries boot work no later frame repeats.
      this.frameWindowEndsAt = time + FRAME_WINDOW_MS;
      return;
    }
    const raw = this.game.loop.rawDelta;
    if (raw > this.frameWindowWorstMs) this.frameWindowWorstMs = raw;
    this.frameWindowFrames += 1;
    this.frameWindowTotalMs += raw;
    if (raw > 0 && raw < this.frameWindowShortestMs) this.frameWindowShortestMs = raw;
    if (raw > this.frameWindowShortestMs * STUTTER_RATIO) this.frameWindowStutters += 1;
    if (time < this.frameWindowEndsAt) return;
    this.worstFrameMs = this.frameWindowWorstMs;
    this.stutterShare =
      this.frameWindowFrames > 0 ? this.frameWindowStutters / this.frameWindowFrames : 0;
    this.averageFrameMs =
      this.frameWindowFrames > 0 ? this.frameWindowTotalMs / this.frameWindowFrames : 0;
    this.updateMsPerSecond = this.frameWindowUpdateMs;
    this.worstUpdateMs = this.frameWindowWorstUpdateMs;
    this.frameWindowUpdateMs = 0;
    this.frameWindowWorstUpdateMs = 0;
    this.frameWindowWorstMs = 0;
    this.frameWindowFrames = 0;
    this.frameWindowTotalMs = 0;
    this.frameWindowStutters = 0;
    this.frameWindowShortestMs = Number.POSITIVE_INFINITY;
    this.frameWindowEndsAt = time + FRAME_WINDOW_MS;
  }

  readAverageFrameMs(): number {
    return this.averageFrameMs;
  }

  readWorstFrameMs(): number {
    return this.worstFrameMs;
  }

  /** Share of the last second's frames that ran long, on `[0, 1]`. */
  readStutterShare(): number {
    return this.stutterShare;
  }

  /** Milliseconds of the last second the scene spent inside its own update. */
  readUpdateMsPerSecond(): number {
    return this.updateMsPerSecond;
  }

  readWorstUpdateMs(): number {
    return this.worstUpdateMs;
  }

  readLiveDrawnCount(): number {
    return this.liveDrawnCount;
  }

  readOffscreenCount(): number {
    return this.offscreenCount;
  }

  applySnapshot(snapshot: DisplayGameSnapshot): void {
    const framedWidth = this.snapshot.cameraViewWidth;
    const previousBackground = this.snapshot.background;
    const previousTick = this.snapshot.tick;
    this.snapshot = snapshot;
    if (hasBackgroundChanged(previousBackground, snapshot.background)) {
      this.applyBackgroundSettings(snapshot.background);
    }
    const shouldSnap = this.snapshotReset.consumeForSnapshot();
    if (!this.sys.isActive()) return;
    // The framed slice comes from the balance preset, so a new run - or a
    // preview slider - can widen it while the scene keeps running.
    if (snapshot.cameraViewWidth !== framedWidth) {
      this.configureViewport(this.canvasWidth, this.canvasHeight);
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
  private drawArena(): void {
    const centerX = this.snapshot.worldWidth / 2;
    const centerY = this.snapshot.worldHeight / 2;
    const radius = this.snapshot.arenaRadius;
    const diameter = radius * 2;
    const scale = SpaceshipScene.ARENA_TEXTURE_SIDE / diameter;

    if (this.tankLook) {
      this.cameras.main.setBackgroundColor(TANK_VOID_COLOR);
      const floor = this.bakedShape(
        `tankArena:floor:${String(Math.round(radius))}`,
        SpaceshipScene.ARENA_TEXTURE_SIDE / 2,
        (graphics) => {
          drawTankArena(graphics, radius * scale, scale);
        }
      );
      this.add.image(centerX, centerY, floor).setDisplaySize(diameter, diameter).setDepth(0);
      const rim = this.bakedShape(
        `tankArena:rim:${String(Math.round(radius))}`,
        SpaceshipScene.ARENA_TEXTURE_SIDE / 2,
        (graphics) => {
          drawTankArenaRim(graphics, radius * scale, scale);
        }
      );
      this.add.image(centerX, centerY, rim).setDisplaySize(diameter, diameter).setDepth(3);
      return;
    }

    this.cameras.main.setBackgroundColor(OUTSIDE_SPACE_COLOR);

    const band = getRimBandStroke(radius, this.snapshot.rimBandWidth);

    const floorKey = this.bakedShape(
      `arena:floor:${String(Math.round(radius))}:${String(Math.round(this.snapshot.rimBandWidth))}`,
      SpaceshipScene.ARENA_TEXTURE_SIDE / 2,
      (graphics) => {
        graphics.fillStyle(ARENA_SPACE_COLOR, ARENA_FILL_ALPHA);
        graphics.fillCircle(0, 0, radius * scale);
        // The band the rim slows a hull in, under the rings so those stay readable.
        if (band !== null) {
          graphics.lineStyle(band.thickness * scale, RIM_BAND_COLOR, RIM_BAND_ALPHA);
          graphics.strokeCircle(0, 0, band.radius * scale);
        }
        // Rings and spokes rather than a square grid: on a round arena what a
        // pilot reads off the floor is the distance to the rim and the bearing,
        // and a square mesh states neither.
        graphics.lineStyle(2 * scale, 0x163746, 0.75);
        for (const ringRadius of getArenaRingRadii(radius)) {
          graphics.strokeCircle(0, 0, ringRadius * scale);
        }
        graphics.lineStyle(2 * scale, 0x14303d, 0.5);
        for (const spoke of getArenaSpokes(0, 0, radius)) {
          graphics.lineBetween(
            spoke.from.x * scale,
            spoke.from.y * scale,
            spoke.to.x * scale,
            spoke.to.y * scale
          );
        }
      }
    );
    this.add.image(centerX, centerY, floorKey).setDisplaySize(diameter, diameter).setDepth(0);

    // Its own image rather than part of the floor: the rim has to stay above
    // the obstacles, and they sit between the two.
    const borderKey = this.bakedShape(
      `arena:border:${String(Math.round(radius))}`,
      SpaceshipScene.ARENA_TEXTURE_SIDE / 2,
      (graphics) => {
        graphics.lineStyle(8 * scale, 0x3d6874, 1);
        graphics.strokeCircle(0, 0, radius * scale);
      }
    );
    this.add.image(centerX, centerY, borderKey).setDisplaySize(diameter, diameter).setDepth(3);
  }

  /**
   * The obstacles, one image each.
   *
   * They never move and never change, and drawn into a `Graphics` they were
   * still tessellated on every frame - the rounded rectangles in particular,
   * which is a fan of triangles per corner. Baked per shape and size, a field
   * of them costs a transform apiece.
   */
  private drawDecorations(): void {
    for (const obstacle of this.snapshot.obstacles) {
      const fill = obstacle.kind === "circle" ? 0x305d63 : 0x435262;
      if (obstacle.kind === "circle") {
        const radius = Math.round(obstacle.radius);
        this.add
          .image(
            obstacle.x,
            obstacle.y,
            this.bakedShape(`rock:field:${String(radius)}`, radius + 6, (graphics) => {
              graphics.fillStyle(fill, 0.78);
              graphics.fillCircle(0, 0, radius);
              graphics.lineStyle(5, 0x78a4a4, 0.7);
              graphics.strokeCircle(0, 0, radius);
            })
          )
          .setDepth(2);
        continue;
      }
      const width = Math.round(obstacle.width);
      const height = Math.round(obstacle.height);
      this.add
        .image(
          obstacle.x,
          obstacle.y,
          bakeRect(
            this,
            `slab:${String(width)}x${String(height)}`,
            width + 8,
            height + 8,
            (graphics) => {
              graphics.fillStyle(fill, 0.78);
              graphics.fillRoundedRect(4, 4, width, height, 24);
              graphics.lineStyle(5, 0x78a4a4, 0.7);
              graphics.strokeRoundedRect(4, 4, width, height, 24);
            }
          )
        )
        .setDepth(2);
    }
  }

  /**
   * Screen-fixed parallax layers: each TileSprite sits at scrollFactor 0 with its origin on the
   * world corner, so it always covers the viewport regardless of camera scroll or zoom. Per frame
   * its tile position is shifted by a fraction of the camera scroll (parallax) plus an accumulated
   * idle drift; factors and drifts are carried over one-to-one from the demo.
   */
  private createBackground(background: DisplayGameSnapshot["background"]): void {
    for (const config of BACKGROUND_LAYERS) {
      const sprite = this.add
        .tileSprite(
          this.backgroundCover.x,
          this.backgroundCover.y,
          this.backgroundCover.width,
          this.backgroundCover.height,
          backgroundTextureKey(config.kind, background.nebulaPreset)
        )
        .setOrigin(0)
        .setScrollFactor(0)
        .setDepth(BACKGROUND_LAYER_DEPTH[config.kind])
        .setTileScale(config.tileScale);
      sprite.setBlendMode(backgroundBlendMode(config.blendMode));
      sprite.alpha = backgroundLayerAlpha(config.kind, background.nebulaAlpha);
      // The scene boots asynchronously, so the switch may already have been
      // thrown before these existed.
      sprite.setVisible(this.backgroundEnabled);
      this.backgroundLayers.push({ sprite, config });
    }
  }

  private applyBackgroundSettings(background: DisplayGameSnapshot["background"]): void {
    for (const layer of this.backgroundLayers) {
      if (!isNebulaLayer(layer.config.kind)) continue;
      layer.sprite.setTexture(backgroundTextureKey(layer.config.kind, background.nebulaPreset));
      layer.sprite.alpha = backgroundLayerAlpha(layer.config.kind, background.nebulaAlpha);
    }
    this.parallaxStrength = background.parallaxStrength;
  }

  /**
   * Turns the parallax layers off, sprites and per-frame work together.
   *
   * Four full-screen tile sprites, three of them blended, are a plausible way to
   * spend a phone's fill rate, and the only way to find out is to take them away
   * on the phone that stutters. Hidden rather than destroyed: this is a question
   * being asked, not a decision being made, and the answer has to be one button
   * away in both directions.
   */
  /**
   * Builds the sky the first time anyone asks for it, and hides it after that.
   *
   * A run starts without it - see the field above - so there is nothing to
   * reveal until this has been on once. Kept switchable rather than deleted
   * because the measurement that took it away is the one thing that could ever
   * bring it back, and that measurement needs both sides.
   */
  setBackgroundEnabled(enabled: boolean): void {
    this.backgroundEnabled = enabled;
    if (enabled && this.backgroundLayers.length === 0) {
      this.createBackground(this.snapshot.background);
      return;
    }
    for (const layer of this.backgroundLayers) {
      layer.sprite.setVisible(enabled);
    }
  }

  /**
   * The per-frame vector overlays on or off.
   *
   * Hidden as well as skipped: a path left on screen from the frame the switch
   * was thrown would sit there frozen and read as a bug rather than an answer.
   */
  setVectorsEnabled(enabled: boolean): void {
    this.vectorsEnabled = enabled;
    for (const drawing of [
      this.shield,
      this.aimEnvelope,
      this.focusRing,
      this.noseFocus,
      this.beams
    ]) {
      drawing?.setVisible(enabled);
    }
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

  /** The shield's bloom on or off, for pricing it on the device that pays. */
  /**
   * Kept as a switch with nothing behind it for exactly as long as it takes to
   * notice: the shield's bloom is gone.
   *
   * It was one filter on one small object, and on a tablet it measured
   * twenty-two points of torn frames - a mobile GPU pays for a render target
   * and a shader pass per frame whatever the object's size. Nothing else on the
   * field glows.
   */
  setGlowEnabled(enabled: boolean): void {
    this.glowEnabled = enabled;
  }

  private updateBackground(deltaMs: number): void {
    if (!this.backgroundEnabled || this.backgroundLayers.length === 0) return;
    const scrollX = this.cameras.main.scrollX;
    const scrollY = this.cameras.main.scrollY;
    // Drift speed comes from the snapshot so a preset change retunes it live.
    this.backgroundDriftSeconds += (deltaMs / 1000) * this.snapshot.background.driftSpeed;
    for (const layer of this.backgroundLayers) {
      const offset = backgroundTileOffset(
        layer.config,
        scrollX,
        scrollY,
        this.parallaxStrength,
        this.backgroundDriftSeconds
      );
      layer.sprite.tilePositionX = modPositive(offset.x, layer.sprite.frame.source.width);
      layer.sprite.tilePositionY = modPositive(offset.y, layer.sprite.frame.source.height);
    }
  }

  /**
   * Laser pulses, drawn straight from the authoritative endpoints. They are not
   * entities and have no track to interpolate: the server says a beam existed
   * for these two ticks, and the display shows exactly that.
   */
  private drawLaserBeams(): void {
    if (this.beams === undefined) return;
    this.beams.clear();
    for (const beam of this.snapshot.laserBeams) {
      const style = beamStyle(beam.source);
      this.beams.lineStyle(style.width, style.color, style.alpha);
      this.beams.beginPath();
      this.beams.moveTo(beam.fromX, beam.fromY);
      this.beams.lineTo(beam.toX, beam.toY);
      this.beams.strokePath();
      this.beams.fillStyle(style.color, style.alpha);
      this.beams.fillCircle(beam.fromX, beam.fromY, style.width);
    }
  }

  /**
   * Where the turret can reach, and - for a barrel that locks on - how far off
   * the bore it will still take a lock. The fill says "inside here"; the two
   * rays say where the edge is, because a wash of colour alone reads as glow
   * rather than as a boundary.
   *
   * A barrel that locks onto nothing still gets a sliver, so the reach stays
   * readable: the gunner's question is as often "does it even carry that far"
   * as "am I on it".
   */
  /**
   * Where the gun can reach, built once and then carried.
   *
   * The wedge is a filled path, and a filled path is triangulated every time it
   * is drawn: under a phone's budget the tessellator and the graphics batcher
   * together were most of a frame. Its shape does not change during a run -
   * only where it points and where it starts - so it is built in the barrel's
   * own coordinates and moved like any other object, and rebuilt only when the
   * reach or the cone itself changes.
   */
  private drawAimEnvelope(origin: { readonly x: number; readonly y: number }, angle: number): void {
    const layer = this.aimEnvelope;
    if (layer === undefined) return;
    const { reach, acquireHalfAngle } = this.snapshot.cannon;
    if (reach <= 0) {
      layer.setVisible(false);
      return;
    }
    const half = Math.max(acquireHalfAngle, AIM_MIN_HALF_ANGLE);
    const shape = this.aimEnvelopeShape;
    if (shape?.reach !== reach || shape.half !== half) {
      this.aimEnvelopeShape = { reach, half };
      /*
       * Baked at a fixed size and stretched to the reach, the way the arena
       * floor is: a wedge nine hundred units long would be a nine-hundred pixel
       * texture otherwise, and a fan of triangles carries that stretch without
       * showing it. The barrel sits at the middle of the square, so half the
       * texture is empty - which is the price of having the image turn about
       * the gun rather than about its own bounding box.
       */
      const side = SpaceshipScene.AIM_TEXTURE_SIDE;
      const drawn = side / 2;
      const key = `aim:${String(Math.round(reach))}:${half.toFixed(3)}`;
      layer.setTexture(
        this.bakedShape(key, drawn, (graphics) => {
          graphics.fillStyle(AIM_ENVELOPE_STYLE.color, AIM_ENVELOPE_STYLE.fillAlpha);
          graphics.slice(0, 0, drawn, -half, half);
          graphics.fillPath();
          /*
           * Drawn at the texture's scale, not the world's.
           *
           * The image is stretched from this square to twice the reach, and a
           * stroke stretches with it: left at its world width the two edges
           * came out three and a half times too thick and the cone read as a
           * beam across the screen. The arena floor does the same arithmetic
           * for the same reason.
           */
          graphics.lineStyle(
            (AIM_ENVELOPE_STYLE.width * drawn) / reach,
            AIM_ENVELOPE_STYLE.color,
            AIM_ENVELOPE_STYLE.edgeAlpha
          );
          for (const edge of [-half, half]) {
            graphics.beginPath();
            graphics.moveTo(0, 0);
            graphics.lineTo(Math.cos(edge) * drawn, Math.sin(edge) * drawn);
            graphics.strokePath();
          }
        })
      );
      layer.setDisplaySize(reach * 2, reach * 2);
    }
    layer.setVisible(this.vectorsEnabled);
    layer.setPosition(origin.x, origin.y);
    layer.setRotation(angle);
  }

  /**
   * A ring around the ship a shot would hit right now, breathing so it reads as
   * live rather than as decoration. There is no lock in this game - the gunner
   * turns a barrel - so the ring is read off the geometry every frame, and it
   * moves the moment the bore does.
   *
   * Drawn at the interpolated positions, not the snapshot's, or it would sit a
   * frame behind the ship it is marking.
   */
  private drawFocusRing(
    origin: { readonly x: number; readonly y: number },
    bearing: number,
    candidates: readonly MutableFocusCandidate[]
  ): void {
    const layer = this.focusRing;
    if (layer === undefined) return;
    const focus = pickFocusedTarget({
      origin,
      bearing,
      reach: this.snapshot.cannon.reach,
      speed: this.snapshot.cannon.speed,
      heldEntityId: this.focusedEntityId,
      candidates
    });
    this.focusedEntityId = focus?.target.entityId;
    if (focus === undefined) {
      layer.setVisible(false);
      return;
    }
    const { target, firable } = focus;
    // A ring per calibre, and the breathing is the image's alpha rather than a
    // colour drawn again: an alpha is a number on an existing texture.
    const radius = Math.round(target.radius + FOCUS_RING_MARGIN);
    const width = firable ? FOCUS_RING_FIRABLE_WIDTH : FOCUS_RING_WIDTH;
    const colour = firable ? FOCUS_RING_FIRABLE_COLOR : FOCUS_RING_HELD_COLOR;
    layer.setTexture(
      this.bakedShape(
        `focus:${firable ? "hot" : "held"}:${String(radius)}`,
        radius + width + 2,
        (graphics) => {
          graphics.lineStyle(width, colour, 1);
          graphics.strokeCircle(0, 0, radius);
        }
      )
    );
    layer.setVisible(this.vectorsEnabled);
    layer.setPosition(target.x, target.y);
    layer.setAlpha(firable ? 0.9 : 0.55 + 0.45 * Math.sin(this.time.now / FOCUS_RING_BREATH_MS));
  }

  /**
   * The ship the nose gun is about to be fired into. Same question as the ring
   * asks of the turret, put to the other barrel: the hull is this one's mount,
   * so the bearing is the ship's own heading.
   */
  private drawNoseFocus(
    origin: { readonly x: number; readonly y: number },
    heading: number,
    candidates: readonly MutableFocusCandidate[]
  ): void {
    const layer = this.noseFocus;
    if (layer === undefined) return;
    const focus = pickFocusedTarget({
      origin,
      bearing: heading,
      reach: this.snapshot.machineGun.reach,
      speed: this.snapshot.machineGun.speed,
      heldEntityId: this.noseFocusedEntityId,
      candidates
    });
    this.noseFocusedEntityId = focus?.target.entityId;
    if (focus?.firable !== true) {
      layer.setVisible(false);
      return;
    }
    const { target } = focus;
    const radius = Math.round(target.radius + NOSE_FOCUS_MARGIN);
    layer.setTexture(
      this.bakedShape(`nosefocus:${String(radius)}`, radius + NOSE_FOCUS_WIDTH + 2, (graphics) => {
        graphics.lineStyle(NOSE_FOCUS_WIDTH, NOSE_FOCUS_COLOR, 0.85);
        // Two arcs across the line of fire, drawn about the bore and then
        // turned with the image, so the brackets open toward the shooter
        // however the pair happens to be placed.
        for (const side of [Math.PI / 2, -Math.PI / 2]) {
          graphics.beginPath();
          graphics.arc(0, 0, radius, side - NOSE_FOCUS_SWEEP, side + NOSE_FOCUS_SWEEP);
          graphics.strokePath();
        }
      })
    );
    layer.setVisible(this.vectorsEnabled);
    layer.setPosition(target.x, target.y);
    layer.setRotation(Math.atan2(target.y - origin.y, target.x - origin.x));
  }

  /**
   * The ships both rings are read against, at the positions being drawn rather
   * than the ones last sent.
   *
   * Refills `focusScratch` instead of building a list, so a steady crowd costs
   * nothing per frame. What makes that safe is that no candidate outlives the
   * frame: both callers read the winner immediately and keep only its id.
   */
  private updateFocusCandidates(playbackTick: number): readonly MutableFocusCandidate[] {
    return fillFocusCandidates(this.focusScratch, this.snapshot.enemyShips, (enemy) => {
      const visual = this.combatVisuals.get(enemy.entityId);
      if (visual === undefined) return enemy;
      // Where it is drawn, from wherever the drawing came: the predictor when
      // there is one, the track when there is not.
      if (visual.live !== undefined) return visual.object;
      return samplePointTrack(visual.position, playbackTick);
    });
  }

  /**
   * The shield, baked once per state and turned to its bearing.
   *
   * It was the last drawing left on the field, and the dearest: a hundred-point
   * crescent, filled - which means triangulated - on every frame the sector was
   * up, and a profile of a real wave put the tessellator and the graphics
   * batcher at the top with it.
   *
   * It was drawn that way for a reason that no longer holds. Turning it used to
   * tear the bloom off, because a `Graphics` object carries no width or height,
   * Phaser calls it poorly bounded, and the focus region its filter is
   * composited through does not follow a rotation. An `Image` has a size, so
   * the filter follows the object like any other; the arc is baked centred on
   * zero and the image is simply turned.
   */
  private drawShield(): void {
    if (this.shield === undefined || this.spaceshipBody === undefined) return;
    const style = getShieldVisualStyle(this.snapshot.shield.active);
    const radius = this.snapshot.shieldRadius;
    const half = this.snapshot.shield.arcHalfAngle;
    // The bake is keyed by everything that changes its shape; the bearing is
    // not one of those things, which is the whole point.
    const key = `shield:${this.snapshot.shield.active ? "up" : "down"}:${String(Math.round(radius))}:${half.toFixed(3)}`;
    const extent = radius + style.lineWidth + 4;
    this.shield.setTexture(
      this.bakedShape(key, extent, (graphics) => {
        const arc = getShieldArcRange(0, half);
        graphics.lineStyle(style.lineWidth, style.color, style.alpha);
        if (style.crescentThickness !== null) {
          const crescent = getShieldCrescentPoints(
            arc.start,
            arc.end,
            radius,
            style.crescentThickness
          );
          if (crescent.length > 0) {
            graphics.fillStyle(style.color, style.alpha);
            graphics.fillPoints(
              crescent.map((point) => new Phaser.Math.Vector2(point.x, point.y)),
              true,
              true
            );
          }
        } else if (style.dash === null) {
          graphics.beginPath();
          graphics.arc(0, 0, radius, arc.start, arc.end, false);
          graphics.strokePath();
        } else {
          for (const segment of getShieldDashSegments(arc.start, arc.end, radius, style.dash)) {
            graphics.beginPath();
            graphics.arc(0, 0, radius, segment.start, segment.end, false);
            graphics.strokePath();
          }
        }
      })
    );
    this.shield.setPosition(this.spaceshipBody.x, this.spaceshipBody.y);
    this.shield.setRotation(this.visualShieldAngle);
    this.shield.setVisible(this.vectorsEnabled);
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
    this.pixelRatio = ratio;
  }

  private readonly handleResize = (gameSize: Phaser.Structs.Size): void => {
    this.configureViewport(gameSize.width, gameSize.height);
  };

  private configureViewport(actualWidth: number, actualHeight: number): void {
    const viewport = getResponsiveViewport(
      actualWidth,
      actualHeight,
      this.snapshot.cameraViewWidth,
      this.snapshot.cameraViewWidth * CAMERA_VIEW_ASPECT
    );
    this.canvasWidth = actualWidth;
    this.canvasHeight = actualHeight;
    // Phaser centres a camera on its own pixel size, and the camera is the
    // letterboxed frame now rather than the whole canvas - so the scroll and the
    // background cover are measured against the frame, not the glass.
    this.rendererWidth = viewport.screen.width;
    this.rendererHeight = viewport.screen.height;
    this.viewportWidth = viewport.width;
    this.viewportHeight = viewport.height;
    this.cameras.main.setZoom(viewport.zoom);
    // The frame is centred in the glass and nothing is drawn outside it, so the
    // slice of arena a crew sees is the same on an ultrawide monitor, a laptop
    // and a tablet - the difference between them is the width of the bars.
    this.cameras.main.setViewport(
      viewport.screen.x,
      viewport.screen.y,
      viewport.screen.width,
      viewport.screen.height
    );
    // Scroll-factor-0 layers still get zoomed around the camera origin, so their world rect is
    // not the viewport window; keep both size and position in sync with it.
    this.backgroundCover = getBackgroundCoverRect(
      viewport.screen.width,
      viewport.screen.height,
      viewport.zoom,
      // The only number here measured in pixels rather than world units, so the
      // only one that has to be told the buffer got denser: left alone, the
      // slack behind the edge would shrink by the ratio.
      BACKGROUND_COVER_MARGIN_PX * this.pixelRatio
    );
    for (const layer of this.backgroundLayers) {
      layer.sprite
        .setPosition(this.backgroundCover.x, this.backgroundCover.y)
        .setSize(this.backgroundCover.width, this.backgroundCover.height);
    }
    // Published for the viewport spec, which has no other way to ask what the
    // camera is actually showing. Inert otherwise: a plain object, written once
    // per resize.
    (globalThis as { __spaceshipDisplayCamera?: DisplayCameraSlice }).__spaceshipDisplayCamera = {
      width: viewport.screen.width,
      height: viewport.screen.height,
      zoom: viewport.zoom,
      pixelRatio: this.pixelRatio,
      canvasWidth: actualWidth,
      canvasHeight: actualHeight
    };
    this.focusCamera(this.spaceshipBody ?? this.snapshot.spaceship);
  }

  private focusCamera(focus: Point): void {
    const scroll = getPhaserCameraScroll({
      focus,
      rendererWidth: this.rendererWidth,
      rendererHeight: this.rendererHeight
    });
    this.cameras.main.setScroll(scroll.x, scroll.y);
  }

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
        const created = this.createCombatVisual(entity);
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
  private static readonly ARENA_TEXTURE_SIDE = 2048;

  /**
   * Side of the baked aiming wedge, in texture pixels.
   *
   * Stretched to the barrel's reach, so this is resolution and not size. Five
   * hundred and twelve over a nine-hundred unit reach is under two units a
   * pixel on a shape with no detail finer than its own edge.
   */
  private static readonly AIM_TEXTURE_SIDE = 512;

  private bakedShape(
    key: string,
    half: number,
    draw: (graphics: Phaser.GameObjects.Graphics) => void
  ): string {
    return bakeShape(this, key, half, draw);
  }

  private createCombatVisual(entity: CombatEntity): {
    readonly object: Phaser.GameObjects.Container;
    readonly healthBar: Phaser.GameObjects.Container | undefined;
  } {
    const container = this.add.container(entity.x, entity.y).setDepth(getEntityDepth(entity));
    let healthBar: Phaser.GameObjects.Container | undefined;
    if (entity.visualKind === "enemy") {
      const visual = resolveEnemyVisual(this.snapshot.enemyCatalogue, entity.kind);
      const key = `enemy:${visual.shape}:${String(visual.modelScale)}:${String(Math.round(entity.radius))}`;
      const body = this.add
        .image(
          0,
          0,
          this.tankLook
            ? this.bakedShape("tank:enemy", ENEMY_ART_HALF + 6, drawEnemyTank)
            : this.bakedShape(key, entity.radius * visual.modelScale * 1.35 + 4, (graphics) => {
                drawEnemyBody(graphics, visual, entity.radius);
              })
        )
        .setScale(this.tankLook ? (entity.radius * visual.modelScale) / ENEMY_ART_HALF : 1);
      container.add(body);
      if (visual.showHealthBar) {
        healthBar = createEnemyHealthBar(this, entity);
        container.add(healthBar);
      }
    } else if (entity.visualKind === "asteroid") {
      const asteroidVisual = this.snapshot.asteroidVisual;
      if (asteroidVisual !== null) {
        const size = entity.radius * asteroidVisual.modelScale;
        const rock = this.add.image(
          0,
          0,
          this.bakedShape(
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
        const rock = this.add.image(
          0,
          0,
          this.bakedShape(
            `rock:plain:${String(Math.round(entity.radius))}`,
            entity.radius + 6,
            (graphics) => {
              graphics.fillStyle(0x766f77, 1);
              graphics.fillCircle(0, 0, entity.radius);
              graphics.lineStyle(4, 0xbba9a2, 1);
              graphics.strokeCircle(0, 0, entity.radius);
              graphics.fillStyle(0x514d59, 1);
              graphics.fillCircle(
                -entity.radius * 0.25,
                -entity.radius * 0.2,
                entity.radius * 0.22
              );
            }
          )
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
      const drop = this.add.image(
        0,
        0,
        this.bakedShape(
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
      const shot = this.add.image(
        0,
        0,
        this.bakedShape(
          `asset:${visual.shape}:${String(Math.round(size))}`,
          size * 1.35 + 4,
          (graphics) => {
            drawCatalogAssetById(graphics, visual.shape, size);
          }
        )
      );
      container.add(shot);
    } else if (entity.visualKind === "missile") {
      const radius = entity.radius;
      const missile = this.add.image(
        0,
        0,
        this.bakedShape(`missile:${String(Math.round(radius))}`, radius * 2.9 + 3, (graphics) => {
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
      const bullet = this.add.image(
        0,
        0,
        this.bakedShape(
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
}

type BackgroundSettings = DisplayGameSnapshot["background"];

function hasBackgroundChanged(previous: BackgroundSettings, next: BackgroundSettings): boolean {
  return (
    previous.parallaxStrength !== next.parallaxStrength ||
    previous.driftSpeed !== next.driftSpeed ||
    previous.nebulaAlpha !== next.nebulaAlpha ||
    previous.nebulaPreset !== next.nebulaPreset
  );
}

function backgroundBlendMode(mode: BackgroundBlendMode): Phaser.BlendModes {
  switch (mode) {
    case "screen":
      return Phaser.BlendModes.SCREEN;
    case "add":
      return Phaser.BlendModes.ADD;
    default:
      return Phaser.BlendModes.NORMAL;
  }
}

function modPositive(value: number, size: number): number {
  return ((value % size) + size) % size;
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

const FALLBACK_ENEMY_VISUAL: PublicEnemyCatalogueEntry = {
  kind: "unknown",
  label: "Unknown",
  shape: FALLBACK_VISUAL_ASSET_ID,
  modelScale: 1,
  showHealthBar: false,
  isBoss: false
};

/** An archetype the display has no entry for still gets drawn, just generically. */
export function resolveEnemyVisual(
  catalogue: readonly PublicEnemyCatalogueEntry[],
  kind: string
): PublicEnemyCatalogueEntry {
  return catalogue.find((entry) => entry.kind === kind) ?? FALLBACK_ENEMY_VISUAL;
}

/**
 * The aiming envelope. Faint enough to read the arena through it, with edges
 * solid enough to be a line rather than a glow.
 */
const AIM_ENVELOPE_STYLE = {
  color: 0x7ef0ff,
  fillAlpha: 0.05,
  edgeAlpha: 0.28,
  width: 2
} as const;
/**
 * The ring says two things in two colours. White while the target is merely the
 * one being held - breathing, so a still frame still reads as "this one, now".
 * Green the moment the barrel is actually on it and inside its reach, which is
 * the only moment a shot connects; that one holds steady, because a light that
 * means "fire" should not be blinking.
 */
const FOCUS_RING_HELD_COLOR = 0xffffff;
const FOCUS_RING_FIRABLE_COLOR = 0x62ff9b;
const FOCUS_RING_WIDTH = 2;
const FOCUS_RING_FIRABLE_WIDTH = 3;
const FOCUS_RING_MARGIN = 10;
const FOCUS_RING_BREATH_MS = 220;

/**
 * The nose gun's mark: two brackets rather than a ring, and yellow rather than
 * white, because it is a different barrel with a different bore. The pilot flies
 * this one - the hull is the mount - so the ship it is about to be fired into is
 * worth saying out loud even though no envelope is drawn for it.
 */
const NOSE_FOCUS_COLOR = 0xffd24a;
const NOSE_FOCUS_WIDTH = 2;
const NOSE_FOCUS_MARGIN = 16;
/** Half the span of each bracket, so the pair reads as "( )" around the hull. */
const NOSE_FOCUS_SWEEP = Math.PI / 5;

/** A barrel with no lock cone still shows this much, so its reach is legible. */
const AIM_MIN_HALF_ANGLE = 0.03;

/** Turret and nose beams read apart the way their projectiles already do. */
const LASER_CANNON_STYLE = { width: 3, color: 0x7ef0ff, alpha: 0.9 } as const;
const LASER_NOSE_STYLE = { width: 2, color: 0xffd783, alpha: 0.85 } as const;
/**
 * Hostile fire is red on this display and ours is not, so the beam follows the
 * same rule. Thicker than either of ours, because a hit that cannot be dodged
 * has to be the thing you see first.
 */
const LASER_ENEMY_STYLE = { width: 4, color: 0xff5a4a, alpha: 0.9 } as const;

function beamStyle(source: string) {
  if (source === ENEMY_BEAM_SOURCE) return LASER_ENEMY_STYLE;
  return source === "cannon" ? LASER_CANNON_STYLE : LASER_NOSE_STYLE;
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
/**
 * Where the weapon is bolted, in world space. The mount is written in the
 * hull's frame, so it has to turn with the hull: a gun put on the left wing
 * stays on the left wing however the ship is pointing.
 */
export function turretMountPoint(
  ship: { readonly x: number; readonly y: number; readonly radius: number },
  heading: number,
  visual: { readonly mountX: number; readonly mountY: number } | null
): { x: number; y: number } {
  if (visual === null) return { x: ship.x, y: ship.y };
  const offsetX = visual.mountX * ship.radius;
  const offsetY = visual.mountY * ship.radius;
  const cos = Math.cos(heading);
  const sin = Math.sin(heading);
  return {
    x: ship.x + offsetX * cos - offsetY * sin,
    y: ship.y + offsetX * sin + offsetY * cos
  };
}

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

/**
 * A drawing turned into a texture, once per key.
 *
 * A `Graphics` object is re-walked, re-tessellated and re-batched on every
 * frame it is visible, however long ago it was drawn - a profile of a throttled
 * fight put that walk and its batcher at two thirds of the main thread. An
 * `Image` of the same drawing is four vertices. So anything with a fixed shape
 * is baked here and then only moved, turned and scaled.
 *
 * The canvas is translated to the middle first, so the drawing's own origin
 * ends up at the texture's centre and the image's default origin lines up with
 * what the graphics version would have shown.
 */
/**
 * A drawing baked at its own size, origin at the top-left corner.
 *
 * The square bake above centres what it draws, which is right for a hull and
 * wrong for a bar: a padded square cannot be scaled to show a fraction of
 * itself without the padding scaling too.
 */
export function bakeRect(
  scene: Phaser.Scene,
  key: string,
  width: number,
  height: number,
  draw: (graphics: Phaser.GameObjects.Graphics) => void
): string {
  if (scene.textures.exists(key)) return key;
  const graphics = scene.make.graphics({ x: 0, y: 0 }, false);
  draw(graphics);
  graphics.generateTexture(key, Math.max(1, Math.ceil(width)), Math.max(1, Math.ceil(height)));
  graphics.destroy();
  return key;
}

export function bakeShape(
  scene: Phaser.Scene,
  key: string,
  half: number,
  draw: (graphics: Phaser.GameObjects.Graphics) => void
): string {
  if (scene.textures.exists(key)) return key;
  const size = Math.max(2, Math.ceil(half * 2));
  const graphics = scene.make.graphics({ x: 0, y: 0 }, false);
  graphics.translateCanvas(size / 2, size / 2);
  draw(graphics);
  graphics.generateTexture(key, size, size);
  graphics.destroy();
  return key;
}

export function drawSpaceshipHull(
  body: Phaser.GameObjects.Graphics,
  snapshot: Pick<DisplayGameSnapshot, "spaceship" | "spaceshipVisual">
): void {
  const visual = snapshot.spaceshipVisual;
  const asset = getVisualAsset(visual?.shape ?? DEFAULT_SPACESHIP_HULL_ASSET_ID);
  drawCatalogAsset(body, asset, snapshot.spaceship.radius * (visual?.modelScale ?? 1));
}

export function drawEnemyBody(
  body: Phaser.GameObjects.Graphics,
  visual: PublicEnemyCatalogueEntry,
  radius: number
): void {
  // The hitbox stays at radius; only the drawn model takes the scale. The id
  // comes from untrusted preset data, so an unknown one still draws.
  drawCatalogAssetById(body, visual.shape, radius * visual.modelScale);
}

const HEALTH_BAR_BACKGROUND = 0x2a0d16;
const HEALTH_BAR_FILL = 0xff5f7a;

/** Where a bar sits and how big it is, from the hull it belongs to. */
export function healthBarBox(entity: Pick<PublicEnemyView, "radius">): {
  readonly width: number;
  readonly height: number;
  readonly top: number;
} {
  const height = Math.max(5, entity.radius * 0.12);
  return { width: entity.radius * 1.8, height, top: -entity.radius - height * 2.4 };
}

export function healthBarFraction(entity: Pick<PublicEnemyView, "hp" | "maxHp">): number {
  if (!Number.isFinite(entity.maxHp) || entity.maxHp <= 0) return 0;
  return Math.max(0, Math.min(1, entity.hp / entity.maxHp));
}

/**
 * Two images rather than a drawing, for the same reason as everything else on
 * the field.
 *
 * A wave is thirty hulls, and a `Graphics` bar on each of them is thirty
 * objects re-walked and re-batched every frame whether or not anyone took
 * damage - which is what a profile of a real wave found still standing after
 * the arena and the hulls were baked. The frame is one texture, the fill is
 * another, and a hit only changes how wide the second one is drawn.
 */
export function createEnemyHealthBar(
  scene: Phaser.Scene,
  entity: PublicEnemyView
): Phaser.GameObjects.Container {
  const { width, height, top } = healthBarBox(entity);
  const size = `${String(Math.round(width))}x${String(Math.round(height))}`;
  const frame = scene.add
    .image(
      0,
      top,
      bakeRect(scene, `hpframe:${size}`, width, height, (graphics) => {
        graphics.fillStyle(HEALTH_BAR_BACKGROUND, 0.85);
        graphics.fillRect(0, 0, width, height);
        graphics.lineStyle(2, 0xffd1b0, 0.7);
        graphics.strokeRect(1, 1, width - 2, height - 2);
      })
    )
    .setOrigin(0.5, 0);
  const fill = scene.add
    .image(
      -width / 2,
      top,
      bakeRect(scene, `hpfill:${size}`, width, height, (graphics) => {
        graphics.fillStyle(HEALTH_BAR_FILL, 1);
        graphics.fillRect(0, 0, width, height);
      })
    )
    .setOrigin(0, 0);
  const bar = scene.add.container(0, 0, [frame, fill]);
  bar.setData("fill", fill);
  setEnemyHealthBar(bar, entity);
  return bar;
}

/** A hit only moves the right edge of the fill; nothing is drawn again. */
export function setEnemyHealthBar(
  bar: Phaser.GameObjects.Container,
  entity: PublicEnemyView
): void {
  const fill = bar.getData("fill") as Phaser.GameObjects.Image | undefined;
  if (fill === undefined) return;
  const { width, height } = healthBarBox(entity);
  fill.setDisplaySize(width * healthBarFraction(entity), height);
}

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

function getEntityHeading(entity: CombatEntity): number {
  if ("heading" in entity) return entity.heading;
  return Math.atan2(entity.velocityY, entity.velocityX);
}

export interface SpaceshipRuntime {
  update(snapshot: DisplayGameSnapshot): void;
  prepareHydration(): void;
  /** Parallax layers on or off, for finding out what they cost on a phone. */
  /** The shield's bloom on or off, for the same reason. */
  /** The vector overlays rebuilt every frame, on or off. */
  setVectorsEnabled(enabled: boolean): void;
  /**
   * Steps the prediction, sends its input and returns the pose - in that order,
   * once per drawn frame, from inside the frame.
   */
  setPredictionDriver(prediction: ScenePrediction | undefined): void;
  /**
   * Where to read the newest snapshot at the top of each frame. Given one, the
   * scene stops waiting to be handed snapshots and takes them itself.
   */
  setSnapshotSource(read: (() => DisplayGameSnapshot | undefined) | undefined): void;
  /**
   * Frames a second as the game loop measures them, not as the browser paints
   * them: what the scene manages to draw is the number worth showing.
   */
  readFps(): number;
  /**
   * The longest frame of the last completed second, in milliseconds. A freeze
   * and a low frame rate are different complaints with different causes, and
   * the average above cannot tell them apart.
   */
  /** The mean frame of the last second, beside the worst one. */
  readAverageFrameMs(): number;
  readWorstFrameMs(): number;
  readStutterShare(): number;
  /** What the scene's own per-frame work costs, summed over the last second. */
  readUpdateMsPerSecond(): number;
  readWorstUpdateMs(): number;
  /** How many entities the last frame drew off the predictor rather than a track. */
  readLiveDrawnCount(): number;
  /** How many of them were outside the camera - what an area filter could drop. */
  readOffscreenCount(): number;
  /**
   * Lowers the ceiling on how many device pixels the scene may draw, when the
   * frame counter says this machine cannot afford the one it has. Down only:
   * see `nextPixelRatioCap`.
   */
  setPixelRatioCap(cap: number): void;
  destroy(): void;
}

export interface SpaceshipRuntimeOptions {
  /**
   * Device pixels per CSS pixel the scene may draw at. Overridable so the
   * ceiling can be chosen on the device that pays for it - see `?dpr=`.
   */
  readonly pixelRatioCap?: number;
}

export function createSpaceshipRuntime(
  host: HTMLElement,
  initialSnapshot: DisplayGameSnapshot,
  options: SpaceshipRuntimeOptions = {}
): SpaceshipRuntime {
  const scene = new SpaceshipScene(initialSnapshot);
  /**
   * What to draw into, for the glass we have right now.
   *
   * `Scale.RESIZE` sized the buffer in CSS pixels, which on a phone is a third
   * of the panel in each direction - the arena was rasterised at a ninth of the
   * pixels it was shown at and blown back up, while the HUD beside it was drawn
   * by the browser at full density. Phaser 4 has no setting for this, so the
   * mode goes to `NONE` and the sizing becomes ours: one observer, one call to
   * `scale.resize`, and the engine resizes the renderer, the cameras and the
   * filter targets off the back of it.
   */
  let currentCap = options.pixelRatioCap;
  const target = () => {
    const cssWidth = host.clientWidth > 0 ? host.clientWidth : BASE_VIEWPORT_WIDTH;
    const cssHeight = host.clientHeight > 0 ? host.clientHeight : BASE_VIEWPORT_HEIGHT;
    return getBackingStoreSize({
      cssWidth,
      cssHeight,
      devicePixelRatio: globalThis.devicePixelRatio,
      ...(currentCap === undefined ? {} : { cap: currentCap }),
      // The glow allocates a target the size of the frame, and older mobile
      // parts refuse past this; before boot there is nobody to ask.
      maxDimension: 4096
    });
  };
  const initial = target();
  scene.setPixelRatio(initial.ratio);
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: host,
    width: initial.width,
    height: initial.height,
    backgroundColor: "#07171f",
    scene,
    render: {
      antialias: true,
      roundPixels: false,
      /**
       * The background is drawn far smaller than it is stored: the frame is
       * 2500 world units across and the tiles are 512 and 1024 texels, so a
       * texel lands on a third of a pixel on a phone. Sampled one level deep
       * that is undersampling, and it reads as the starfield crawling and
       * sparkling whenever the camera moves. Every one of the six textures is a
       * power of two, so the whole chain is legal - and trilinear minification
       * is cheaper than the aliasing it replaces, not dearer.
       */
      mipmapFilter: "LINEAR_MIPMAP_LINEAR",
      /** Free on a phone, and picks the discrete GPU on a laptop that has two. */
      powerPreference: "high-performance"
    },
    // Ours to size, and ours alone: `RESIZE` would overwrite the buffer with the
    // CSS box on every parent poll, and centring is the stylesheet's job - the
    // canvas is pinned to its box there, so Phaser's margins would be zeroes it
    // recomputed on every refresh.
    scale: { mode: Phaser.Scale.NONE, autoCenter: Phaser.Scale.NO_CENTER }
  });

  const applyTarget = (): void => {
    if (!game.isBooted) return;
    const next = target();
    // Guarded, because the observer also fires for changes that leave the box
    // where it was, and `resize` re-emits the event the scene listens to.
    if (next.width === game.scale.gameSize.width && next.height === game.scale.gameSize.height) {
      return;
    }
    scene.setPixelRatio(next.ratio);
    game.scale.resize(next.width, next.height);
  };
  // Two watchers, and they are not the same one twice: the observer hears the
  // box change - rotation, fullscreen, the HUD reflowing around it - and the
  // media query hears the density change under a box that did not move, which
  // is a window dragged to another monitor or the browser zoomed.
  const observer = new ResizeObserver(applyTarget);
  observer.observe(host);
  const unwatchRatio = watchDevicePixelRatio(applyTarget);

  return {
    update(snapshot) {
      scene.applySnapshot(snapshot);
    },
    prepareHydration() {
      scene.prepareHydration();
    },
    setVectorsEnabled(enabled) {
      scene.setVectorsEnabled(enabled);
    },
    setPredictionDriver(prediction) {
      scene.setPredictionDriver(prediction);
    },
    setSnapshotSource(read) {
      scene.setSnapshotSource(read);
    },
    readFps() {
      return game.loop.actualFps;
    },
    readAverageFrameMs() {
      return scene.readAverageFrameMs();
    },
    readWorstFrameMs() {
      return scene.readWorstFrameMs();
    },
    readStutterShare() {
      return scene.readStutterShare();
    },
    readUpdateMsPerSecond() {
      return scene.readUpdateMsPerSecond();
    },
    readWorstUpdateMs() {
      return scene.readWorstUpdateMs();
    },
    readLiveDrawnCount() {
      return scene.readLiveDrawnCount();
    },
    readOffscreenCount() {
      return scene.readOffscreenCount();
    },
    setPixelRatioCap(cap) {
      if (cap === currentCap) return;
      currentCap = cap;
      applyTarget();
    },
    destroy() {
      observer.disconnect();
      unwatchRatio();
      game.destroy(true);
    }
  };
}
