import {
  CAMERA_VIEW_ASPECT,
  FALLBACK_VISUAL_ASSET_ID,
  getVisualAsset
} from "@spaceship-defender/protocol";
import type {
  DisplayGameSnapshot,
  PublicAsteroidView,
  PublicEnemyCatalogueEntry,
  PublicEnemyView,
  PublicHomingMissileView,
  PublicProjectileView
} from "@spaceship-defender/protocol";
import Phaser from "phaser";

import {
  advancePlayback,
  backgroundTileOffset,
  createAngleTransition,
  createPlaybackClock,
  createPointTransition,
  createSnappedVisualTransitions,
  getBackgroundCoverRect,
  getCameraOverscan,
  getCircularGridSegments,
  getPhaserCameraScroll,
  getResponsiveViewport,
  getSegmentAlpha,
  getShieldArcRange,
  getShieldCrescentPoints,
  getShieldDashSegments,
  getShieldVisualStyle,
  interpolateAngle,
  interpolatePoint,
  observePlaybackTick,
  reconcileStableIds,
  SnapshotResetLatch,
  type AngleTransition,
  type BackgroundCoverRect,
  type PlaybackClock,
  type Point,
  type PointTransition
} from "./spaceshipViewModel.js";
import { drawCatalogAsset, drawCatalogAssetById } from "./catalogRenderer.js";
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

const BASE_VIEWPORT_WIDTH = 1600;
const BASE_VIEWPORT_HEIGHT = 900;
const OUTSIDE_SPACE_COLOR = 0x02070d;
/** Drawn when a preset picks no hull of its own. */
const DEFAULT_SPACESHIP_HULL_ASSET_ID = "ship-dart";
const ARENA_SPACE_COLOR = 0x07171f;
/** The parallax background shows through the arena disc. */
const ARENA_FILL_ALPHA = 0.5;

interface BackgroundLayerState {
  readonly sprite: Phaser.GameObjects.TileSprite;
  readonly config: BackgroundLayerConfig;
}

type CombatEntity =
  | (PublicEnemyView & { readonly visualKind: "enemy" })
  | (PublicAsteroidView & { readonly visualKind: "asteroid" })
  | (PublicProjectileView & { readonly visualKind: "projectile" })
  | (PublicHomingMissileView & { readonly visualKind: "missile" });

interface CombatVisual {
  readonly object: Phaser.GameObjects.Container;
  readonly healthBar: Phaser.GameObjects.Graphics | undefined;
  position: PointTransition;
  angle: AngleTransition;
}

class SpaceshipScene extends Phaser.Scene {
  private snapshot: DisplayGameSnapshot;
  private spaceshipBody: Phaser.GameObjects.Graphics | undefined;
  private noseMarker: Phaser.GameObjects.Graphics | undefined;
  private turret: TurretObject | undefined;
  private shield: Phaser.GameObjects.Graphics | undefined;
  private shieldGlow: Phaser.Filters.Glow | undefined;
  private visualShieldAngle: number;
  private spaceshipTransition: PointTransition;
  private headingTransition: AngleTransition;
  private turretTransition: AngleTransition;
  private shieldTransition: AngleTransition;
  private playback: PlaybackClock;
  /** Arrival of the last snapshot that carried a new tick, for pace measuring. */
  private lastSnapshotAt: number | undefined;
  private readonly snapshotReset = new SnapshotResetLatch();
  private readonly combatVisuals = new Map<string, CombatVisual>();
  private readonly backgroundLayers: BackgroundLayerState[] = [];
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
  private rendererWidth = BASE_VIEWPORT_WIDTH;
  private rendererHeight = BASE_VIEWPORT_HEIGHT;
  private cameraOverscan = 0;

  constructor(snapshot: DisplayGameSnapshot) {
    super("spaceship");
    this.snapshot = snapshot;
    this.visualShieldAngle = snapshot.shield.angle;
    const tick = snapshot.tick;
    this.playback = createPlaybackClock(tick);
    this.spaceshipTransition = createPointTransition(
      snapshot.spaceship,
      snapshot.spaceship,
      tick,
      tick
    );
    this.headingTransition = createAngleTransition(
      snapshot.spaceship.heading,
      snapshot.spaceship.heading,
      tick,
      tick
    );
    this.turretTransition = createAngleTransition(
      snapshot.turretAngle,
      snapshot.turretAngle,
      tick,
      tick
    );
    this.shieldTransition = createAngleTransition(
      snapshot.shield.angle,
      snapshot.shield.angle,
      tick,
      tick
    );
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
    this.createBackground(this.snapshot.background);
    this.drawDecorations();

    this.spaceshipBody = this.add.graphics().setDepth(10);
    drawSpaceshipHull(this.spaceshipBody, this.snapshot);
    this.spaceshipBody
      .setPosition(this.snapshot.spaceship.x, this.snapshot.spaceship.y)
      .setRotation(this.snapshot.spaceship.heading);

    const shipRadius = this.snapshot.spaceship.radius;
    this.noseMarker = this.add.graphics().setDepth(11);
    this.noseMarker.fillStyle(0xffd36f, 1);
    this.noseMarker.fillTriangle(shipRadius - 4, -9, shipRadius + 12, 0, shipRadius - 4, 9);
    this.noseMarker
      .setPosition(this.snapshot.spaceship.x, this.snapshot.spaceship.y)
      .setRotation(this.snapshot.spaceship.heading);

    this.turret = createTurret(this, this.snapshot);
    this.shield = this.add.graphics().setDepth(14);
    this.shieldGlow = attachShieldGlow(this.shield);
    const tick = this.snapshot.tick;
    this.snapToSnapshot(this.snapshot, tick);
    this.drawShield();
    this.reconcileCombatVisuals(tick, tick, true);
  }

  override update(_time: number, deltaMs: number): void {
    this.updateBackground(deltaMs);
    this.playback = advancePlayback(this.playback, deltaMs);
    if (this.spaceshipBody === undefined || this.turret === undefined || this.shield === undefined)
      return;
    const playbackTick = this.playback.tick;
    const spaceshipPosition = interpolateTransition(this.spaceshipTransition, playbackTick);
    const spaceshipHeading = interpolateAngleTransition(this.headingTransition, playbackTick);
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
    this.turret.rotation = interpolateAngleTransition(this.turretTransition, playbackTick);
    this.visualShieldAngle = interpolateAngleTransition(this.shieldTransition, playbackTick);
    this.drawShield();
    this.focusCamera(spaceshipPosition);

    for (const visual of this.combatVisuals.values()) {
      const position = interpolateTransition(visual.position, playbackTick);
      visual.object.setPosition(position.x, position.y);
      visual.object.rotation = interpolateAngleTransition(visual.angle, playbackTick);
      // Keep the bar level while the hull it belongs to turns.
      if (visual.healthBar !== undefined) visual.healthBar.rotation = -visual.object.rotation;
    }
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
      this.configureViewport(this.rendererWidth, this.rendererHeight);
    }
    if (shouldSnap || this.spaceshipBody === undefined || this.turret === undefined) {
      this.snapToSnapshot(snapshot, snapshot.tick);
      // The measured pace survives a hydration: the room did not change its
      // rate just because this client lost the thread of it.
      this.playback = createPlaybackClock(snapshot.tick, this.playback.msPerTick);
      this.lastSnapshotAt = performance.now();
      this.reconcileCombatVisuals(snapshot.tick, snapshot.tick, true);
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
    // A segment runs authoritative sample to authoritative sample, so the
    // previous target is the new origin - not wherever the visual happens to
    // sit mid-playback, which would shorten every move by the lag.
    this.spaceshipTransition = createPointTransition(
      this.spaceshipTransition.to,
      snapshot.spaceship,
      previousTick,
      snapshot.tick
    );
    this.headingTransition = createAngleTransition(
      this.headingTransition.to,
      snapshot.spaceship.heading,
      previousTick,
      snapshot.tick
    );
    this.turretTransition = createAngleTransition(
      this.turretTransition.to,
      snapshot.turretAngle,
      previousTick,
      snapshot.tick
    );
    this.shieldTransition = createAngleTransition(
      this.shieldTransition.to,
      snapshot.shield.angle,
      previousTick,
      snapshot.tick
    );
    this.reconcileCombatVisuals(previousTick, snapshot.tick, false);
  }

  prepareHydration(): void {
    for (const visual of this.combatVisuals.values()) visual.object.destroy();
    this.combatVisuals.clear();
    this.snapshotReset.request();
  }

  private drawArena(): void {
    const centerX = this.snapshot.worldWidth / 2;
    const centerY = this.snapshot.worldHeight / 2;
    this.cameras.main.setBackgroundColor(OUTSIDE_SPACE_COLOR);

    const graphics = this.add.graphics().setDepth(0);
    graphics.fillStyle(ARENA_SPACE_COLOR, ARENA_FILL_ALPHA);
    graphics.fillCircle(centerX, centerY, this.snapshot.arenaRadius);
    graphics.lineStyle(2, 0x163746, 0.75);
    for (const segment of getCircularGridSegments(
      centerX,
      centerY,
      this.snapshot.arenaRadius,
      100
    )) {
      graphics.lineBetween(segment.from.x, segment.from.y, segment.to.x, segment.to.y);
    }

    const border = this.add.graphics().setDepth(3);
    border.lineStyle(8, 0x3d6874, 1);
    border.strokeCircle(centerX, centerY, this.snapshot.arenaRadius);
  }

  private drawDecorations(): void {
    const graphics = this.add.graphics().setDepth(2);
    for (const obstacle of this.snapshot.obstacles) {
      graphics.fillStyle(obstacle.kind === "circle" ? 0x305d63 : 0x435262, 0.78);
      graphics.lineStyle(5, 0x78a4a4, 0.7);
      if (obstacle.kind === "circle") {
        graphics.fillCircle(obstacle.x, obstacle.y, obstacle.radius);
        graphics.strokeCircle(obstacle.x, obstacle.y, obstacle.radius);
      } else {
        graphics.fillRoundedRect(
          obstacle.x - obstacle.width / 2,
          obstacle.y - obstacle.height / 2,
          obstacle.width,
          obstacle.height,
          24
        );
        graphics.strokeRoundedRect(
          obstacle.x - obstacle.width / 2,
          obstacle.y - obstacle.height / 2,
          obstacle.width,
          obstacle.height,
          24
        );
      }
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

  private updateBackground(deltaMs: number): void {
    if (this.backgroundLayers.length === 0) return;
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

  private drawShield(): void {
    if (this.shield === undefined || this.spaceshipBody === undefined) return;
    this.shield.clear();
    this.shield.setPosition(this.spaceshipBody.x, this.spaceshipBody.y);
    const style = getShieldVisualStyle(this.snapshot.shield.active);
    const arc = getShieldArcRange(this.visualShieldAngle, this.snapshot.shield.arcHalfAngle);
    // Drawn where the shield actually intercepts, not at a radius guessed from the hull.
    const radius = this.snapshot.shieldRadius;
    this.shield.lineStyle(style.lineWidth, style.color, style.alpha);
    if (style.crescentThickness !== null) {
      const crescent = getShieldCrescentPoints(arc.start, arc.end, radius, style.crescentThickness);
      if (crescent.length > 0) {
        this.shield.fillStyle(style.color, style.alpha);
        this.shield.fillPoints(
          crescent.map((point) => new Phaser.Math.Vector2(point.x, point.y)),
          true,
          true
        );
      }
    } else if (style.dash === null) {
      this.shield.beginPath();
      this.shield.arc(0, 0, radius, arc.start, arc.end, false);
      this.shield.strokePath();
    } else {
      for (const segment of getShieldDashSegments(arc.start, arc.end, radius, style.dash)) {
        this.shield.beginPath();
        this.shield.arc(0, 0, radius, segment.start, segment.end, false);
        this.shield.strokePath();
      }
    }
    if (this.shieldGlow !== undefined) this.shieldGlow.active = this.snapshot.shield.active;
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
    const transitions = createSnappedVisualTransitions(snapshot, tick);
    this.spaceshipTransition = transitions.spaceship;
    this.headingTransition = createAngleTransition(
      snapshot.spaceship.heading,
      snapshot.spaceship.heading,
      tick,
      tick
    );
    this.turretTransition = transitions.turret;
    this.shieldTransition = transitions.shield;
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
    this.rendererWidth = actualWidth;
    this.rendererHeight = actualHeight;
    this.viewportWidth = viewport.width;
    this.viewportHeight = viewport.height;
    this.cameraOverscan = getCameraOverscan(this.snapshot.spaceship.radius, viewport.zoom);
    this.cameras.main.setZoom(viewport.zoom);
    this.cameras.main.setBounds(
      -this.cameraOverscan,
      -this.cameraOverscan,
      this.snapshot.worldWidth + this.cameraOverscan * 2,
      this.snapshot.worldHeight + this.cameraOverscan * 2
    );
    // Scroll-factor-0 layers still get zoomed around the camera origin, so their world rect is
    // not the viewport window; keep both size and position in sync with it.
    this.backgroundCover = getBackgroundCoverRect(actualWidth, actualHeight, viewport.zoom);
    for (const layer of this.backgroundLayers) {
      layer.sprite
        .setPosition(this.backgroundCover.x, this.backgroundCover.y)
        .setSize(this.backgroundCover.width, this.backgroundCover.height);
    }
    this.focusCamera(this.spaceshipBody ?? this.snapshot.spaceship);
  }

  private focusCamera(focus: Point): void {
    const scroll = getPhaserCameraScroll({
      focus,
      worldWidth: this.snapshot.worldWidth,
      worldHeight: this.snapshot.worldHeight,
      rendererWidth: this.rendererWidth,
      rendererHeight: this.rendererHeight,
      viewportWidth: this.viewportWidth,
      viewportHeight: this.viewportHeight,
      overscan: this.cameraOverscan
    });
    this.cameras.main.setScroll(scroll.x, scroll.y);
  }

  private reconcileCombatVisuals(fromTick: number, toTick: number, snap: boolean): void {
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
          // An entity appears already formed at the newest tick; there is no
          // earlier authoritative sample to walk it out of.
          position: createPointTransition(entity, entity, toTick, toTick),
          angle: createAngleTransition(heading, heading, toTick, toTick)
        });
      } else {
        const fromPoint = snap ? entity : visual.position.to;
        const fromHeading = snap ? heading : visual.angle.to;
        if (snap) visual.object.setPosition(entity.x, entity.y).setRotation(heading);
        visual.position = createPointTransition(fromPoint, entity, fromTick, toTick);
        visual.angle = createAngleTransition(fromHeading, heading, fromTick, toTick);
        if (visual.healthBar !== undefined && entity.visualKind === "enemy") {
          drawEnemyHealthBar(visual.healthBar, entity);
        }
      }
    }
  }

  private createCombatVisual(entity: CombatEntity): {
    readonly object: Phaser.GameObjects.Container;
    readonly healthBar: Phaser.GameObjects.Graphics | undefined;
  } {
    const container = this.add.container(entity.x, entity.y).setDepth(getEntityDepth(entity));
    let healthBar: Phaser.GameObjects.Graphics | undefined;
    if (entity.visualKind === "enemy") {
      const visual = resolveEnemyVisual(this.snapshot.enemyCatalogue, entity.kind);
      const body = this.add.graphics();
      drawEnemyBody(body, visual, entity.radius);
      container.add(body);
      if (visual.showHealthBar) {
        healthBar = this.add.graphics();
        drawEnemyHealthBar(healthBar, entity);
        container.add(healthBar);
      }
    } else if (entity.visualKind === "asteroid") {
      const asteroidVisual = this.snapshot.asteroidVisual;
      if (asteroidVisual !== null) {
        const rock = this.add.graphics();
        drawCatalogAssetById(rock, asteroidVisual.shape, entity.radius * asteroidVisual.modelScale);
        container.add(rock);
      } else {
        const rock = this.add.circle(0, 0, entity.radius, 0x766f77, 1).setStrokeStyle(4, 0xbba9a2);
        const crater = this.add.circle(
          -entity.radius * 0.25,
          -entity.radius * 0.2,
          entity.radius * 0.22,
          0x514d59
        );
        container.add([rock, crater]);
      }
    } else if (entity.visual !== null) {
      const shot = this.add.graphics();
      drawCatalogAssetById(shot, entity.visual.shape, entity.radius * entity.visual.modelScale);
      container.add(shot);
    } else if (entity.visualKind === "missile") {
      const body = this.add.rectangle(0, 0, entity.radius * 3.2, entity.radius * 1.3, 0xff704d);
      // Graphics keeps the plume on the missile axis; a Triangle would centre
      // itself on its bounding box and drift the flame sideways.
      const trail = this.add.graphics();
      trail.fillStyle(0xffd36f, 0.8);
      trail.fillTriangle(
        -entity.radius * 2.9,
        0,
        -entity.radius * 1.6,
        -entity.radius * 0.65,
        -entity.radius * 1.6,
        entity.radius * 0.65
      );
      container.add([trail, body]);
    } else {
      const style = getProjectileStyle(entity);
      const bullet = this.add
        .circle(0, 0, entity.radius, style.fill, 1)
        .setStrokeStyle(2, style.stroke);
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
  showHealthBar: false
};

/** An archetype the display has no entry for still gets drawn, just generically. */
export function resolveEnemyVisual(
  catalogue: readonly PublicEnemyCatalogueEntry[],
  kind: string
): PublicEnemyCatalogueEntry {
  return catalogue.find((entry) => entry.kind === kind) ?? FALLBACK_ENEMY_VISUAL;
}

const SHIELD_GLOW_COLOR = 0x65baff;
/** Gentle bloom: the crescent already carries the shape, the glow only softens it. */
const SHIELD_GLOW_OUTER_STRENGTH = 2.4;
/** Fixed at creation by Phaser; a wider distance at higher quality falls off smoothly. */
const SHIELD_GLOW_QUALITY = 16;
const SHIELD_GLOW_DISTANCE = 24;

/**
 * `Phaser.AUTO` can settle on a renderer with no filter support, and then the
 * game object never gets a filter list. The arc still has to be drawn, so the
 * glow is treated as an enhancement that may simply be unavailable.
 */
function attachShieldGlow(shield: Phaser.GameObjects.Graphics): Phaser.Filters.Glow | undefined {
  shield.enableFilters();
  const filters = shield.filters;
  if (filters === null) return undefined;
  const glow = filters.external.addGlow(
    SHIELD_GLOW_COLOR,
    SHIELD_GLOW_OUTER_STRENGTH,
    0,
    1,
    false,
    SHIELD_GLOW_QUALITY,
    SHIELD_GLOW_DISTANCE
  );
  glow.active = false;
  return glow;
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
  const gun = scene.add.graphics();
  drawCatalogAssetById(gun, visual.shape, snapshot.spaceship.radius * visual.modelScale);
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

export function drawEnemyHealthBar(
  bar: Phaser.GameObjects.Graphics,
  entity: PublicEnemyView
): void {
  const width = entity.radius * 1.8;
  const height = Math.max(5, entity.radius * 0.12);
  const top = -entity.radius - height * 2.4;
  const ratio = Math.max(0, Math.min(1, entity.hp / entity.maxHp));
  bar.clear();
  bar.fillStyle(HEALTH_BAR_BACKGROUND, 0.85);
  bar.fillRect(-width / 2, top, width, height);
  bar.fillStyle(HEALTH_BAR_FILL, 1);
  bar.fillRect(-width / 2, top, width * ratio, height);
  bar.lineStyle(2, 0xffd1b0, 0.7);
  bar.strokeRect(-width / 2, top, width, height);
}

function getProjectileStyle(entity: PublicProjectileView): { fill: number; stroke: number } {
  if (entity.kind === "friendly" && entity.source === "machineGun") {
    return { fill: 0x5fe8d8, stroke: 0xbffcf2 };
  }
  const friendly = entity.kind === "friendly";
  return { fill: friendly ? 0xffd36f : 0xff685f, stroke: friendly ? 0xfff1b2 : 0xffc2bd };
}

function getEntityDepth(entity: CombatEntity): number {
  return entity.visualKind === "asteroid" ? 5 : entity.visualKind === "enemy" ? 7 : 11;
}

function getEntityHeading(entity: CombatEntity): number {
  if ("heading" in entity) return entity.heading;
  return Math.atan2(entity.velocityY, entity.velocityX);
}

function interpolateTransition(transition: PointTransition, playbackTick: number): Point {
  return interpolatePoint(
    transition.from,
    transition.to,
    getSegmentAlpha(transition.fromTick, transition.toTick, playbackTick)
  );
}

function interpolateAngleTransition(transition: AngleTransition, playbackTick: number): number {
  return interpolateAngle(
    transition.from,
    transition.to,
    getSegmentAlpha(transition.fromTick, transition.toTick, playbackTick)
  );
}

export interface SpaceshipRuntime {
  update(snapshot: DisplayGameSnapshot): void;
  prepareHydration(): void;
  destroy(): void;
}

export function createSpaceshipRuntime(
  host: HTMLElement,
  initialSnapshot: DisplayGameSnapshot
): SpaceshipRuntime {
  const scene = new SpaceshipScene(initialSnapshot);
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: host,
    width: host.clientWidth > 0 ? host.clientWidth : BASE_VIEWPORT_WIDTH,
    height: host.clientHeight > 0 ? host.clientHeight : BASE_VIEWPORT_HEIGHT,
    backgroundColor: "#07171f",
    scene,
    render: { antialias: true, roundPixels: false },
    scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH }
  });
  return {
    update(snapshot) {
      scene.applySnapshot(snapshot);
    },
    prepareHydration() {
      scene.prepareHydration();
    },
    destroy() {
      game.destroy(true);
    }
  };
}
