import type {
  DisplayGameSnapshot,
  EnemyShape,
  PublicAsteroidView,
  PublicEnemyCatalogueEntry,
  PublicEnemyView,
  PublicHomingMissileView,
  PublicProjectileView
} from "@spaceship-defender/protocol";
import Phaser from "phaser";

import {
  createAngleTransition,
  createPointTransition,
  createSnappedVisualTransitions,
  getCameraOverscan,
  getCircularGridSegments,
  getPhaserCameraScroll,
  getResponsiveViewport,
  getShieldArcRange,
  getShieldVisualStyle,
  getTimelineAlpha,
  interpolateAngle,
  interpolatePoint,
  reconcileStableIds,
  SnapshotResetLatch,
  type AngleTransition,
  type Point,
  type PointTransition
} from "./spaceshipViewModel.js";

const BASE_VIEWPORT_WIDTH = 1600;
const BASE_VIEWPORT_HEIGHT = 900;
const SNAPSHOT_TRANSITION_MS = 50;
const OUTSIDE_SPACE_COLOR = 0x02070d;
const ARENA_SPACE_COLOR = 0x07171f;

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
  private turret: Phaser.GameObjects.Rectangle | undefined;
  private shield: Phaser.GameObjects.Graphics | undefined;
  private visualShieldAngle: number;
  private spaceshipTransition: PointTransition;
  private headingTransition: AngleTransition;
  private turretTransition: AngleTransition;
  private shieldTransition: AngleTransition;
  private readonly snapshotReset = new SnapshotResetLatch();
  private readonly combatVisuals = new Map<string, CombatVisual>();
  private viewportWidth = BASE_VIEWPORT_WIDTH;
  private viewportHeight = BASE_VIEWPORT_HEIGHT;
  private rendererWidth = BASE_VIEWPORT_WIDTH;
  private rendererHeight = BASE_VIEWPORT_HEIGHT;
  private cameraOverscan = 0;

  constructor(snapshot: DisplayGameSnapshot) {
    super("spaceship");
    this.snapshot = snapshot;
    this.visualShieldAngle = snapshot.shield.angle;
    this.spaceshipTransition = createPointTransition(snapshot.spaceship, snapshot.spaceship, 0);
    this.headingTransition = createAngleTransition(
      snapshot.spaceship.heading,
      snapshot.spaceship.heading,
      0
    );
    this.turretTransition = createAngleTransition(snapshot.turretAngle, snapshot.turretAngle, 0);
    this.shieldTransition = createAngleTransition(snapshot.shield.angle, snapshot.shield.angle, 0);
  }

  create(): void {
    this.configureViewport(this.scale.gameSize.width, this.scale.gameSize.height);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    });
    this.focusCamera(this.snapshot.spaceship);
    this.drawArena();
    this.drawDecorations();

    this.spaceshipBody = this.add.graphics().setDepth(10);
    this.spaceshipBody.fillStyle(0x7dd8c4, 1);
    this.spaceshipBody.fillCircle(0, 0, this.snapshot.spaceship.radius);
    this.spaceshipBody.lineStyle(7, 0x153b43, 1);
    this.spaceshipBody.strokeCircle(0, 0, this.snapshot.spaceship.radius);
    this.spaceshipBody.fillStyle(0xe8be67, 1);
    this.spaceshipBody.fillCircle(0, 0, 18);
    this.spaceshipBody.setPosition(this.snapshot.spaceship.x, this.snapshot.spaceship.y);

    const shipRadius = this.snapshot.spaceship.radius;
    this.noseMarker = this.add.graphics().setDepth(11);
    this.noseMarker.fillStyle(0xffd36f, 1);
    this.noseMarker.fillTriangle(shipRadius - 4, -9, shipRadius + 12, 0, shipRadius - 4, 9);
    this.noseMarker
      .setPosition(this.snapshot.spaceship.x, this.snapshot.spaceship.y)
      .setRotation(this.snapshot.spaceship.heading);

    this.turret = this.add
      .rectangle(this.snapshot.spaceship.x, this.snapshot.spaceship.y, 92, 16, 0xffd36f)
      .setOrigin(0.16, 0.5)
      .setDepth(12)
      .setRotation(this.snapshot.turretAngle);
    this.shield = this.add.graphics().setDepth(14);
    const now = performance.now();
    this.snapToSnapshot(this.snapshot, now);
    this.drawShield();
    this.reconcileCombatVisuals(now, true);
  }

  override update(): void {
    if (this.spaceshipBody === undefined || this.turret === undefined || this.shield === undefined)
      return;
    const now = performance.now();
    const spaceshipPosition = interpolateTransition(this.spaceshipTransition, now);
    this.spaceshipBody.setPosition(spaceshipPosition.x, spaceshipPosition.y);
    if (this.noseMarker !== undefined) {
      this.noseMarker
        .setPosition(spaceshipPosition.x, spaceshipPosition.y)
        .setRotation(interpolateAngleTransition(this.headingTransition, now));
    }
    this.turret.setPosition(spaceshipPosition.x, spaceshipPosition.y);
    this.turret.rotation = interpolateAngleTransition(this.turretTransition, now);
    this.visualShieldAngle = interpolateAngleTransition(this.shieldTransition, now);
    this.drawShield();
    this.focusCamera(spaceshipPosition);

    for (const visual of this.combatVisuals.values()) {
      const position = interpolateTransition(visual.position, now);
      visual.object.setPosition(position.x, position.y);
      visual.object.rotation = interpolateAngleTransition(visual.angle, now);
      // Keep the bar level while the hull it belongs to turns.
      if (visual.healthBar !== undefined) visual.healthBar.rotation = -visual.object.rotation;
    }
  }

  applySnapshot(snapshot: DisplayGameSnapshot): void {
    this.snapshot = snapshot;
    const shouldSnap = this.snapshotReset.consumeForSnapshot();
    if (!this.sys.isActive()) return;
    const now = performance.now();
    if (shouldSnap || this.spaceshipBody === undefined || this.turret === undefined) {
      this.snapToSnapshot(snapshot, now);
    } else {
      this.spaceshipTransition = createPointTransition(this.spaceshipBody, snapshot.spaceship, now);
      this.headingTransition = createAngleTransition(
        this.noseMarker?.rotation ?? snapshot.spaceship.heading,
        snapshot.spaceship.heading,
        now
      );
      this.turretTransition = createAngleTransition(
        this.turret.rotation,
        snapshot.turretAngle,
        now
      );
      this.shieldTransition = createAngleTransition(
        this.visualShieldAngle,
        snapshot.shield.angle,
        now
      );
    }
    this.reconcileCombatVisuals(now, shouldSnap);
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
    graphics.fillStyle(ARENA_SPACE_COLOR, 1);
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

  private drawShield(): void {
    if (this.shield === undefined || this.spaceshipBody === undefined) return;
    this.shield.clear();
    this.shield.setPosition(this.spaceshipBody.x, this.spaceshipBody.y);
    const style = getShieldVisualStyle(this.snapshot.shield.active);
    const arc = getShieldArcRange(this.visualShieldAngle, this.snapshot.shield.arcHalfAngle);
    this.shield.lineStyle(style.lineWidth, style.color, style.alpha);
    this.shield.beginPath();
    this.shield.arc(0, 0, this.snapshot.spaceship.radius + 34, arc.start, arc.end, false);
    this.shield.strokePath();
  }

  private snapToSnapshot(snapshot: DisplayGameSnapshot, now: number): void {
    if (this.spaceshipBody === undefined || this.turret === undefined) return;
    this.spaceshipBody.setPosition(snapshot.spaceship.x, snapshot.spaceship.y);
    if (this.noseMarker !== undefined) {
      this.noseMarker
        .setPosition(snapshot.spaceship.x, snapshot.spaceship.y)
        .setRotation(snapshot.spaceship.heading);
    }
    this.turret.setPosition(snapshot.spaceship.x, snapshot.spaceship.y);
    this.turret.setRotation(snapshot.turretAngle);
    this.visualShieldAngle = snapshot.shield.angle;
    const transitions = createSnappedVisualTransitions(snapshot, now);
    this.spaceshipTransition = transitions.spaceship;
    this.headingTransition = createAngleTransition(
      snapshot.spaceship.heading,
      snapshot.spaceship.heading,
      now
    );
    this.turretTransition = transitions.turret;
    this.shieldTransition = transitions.shield;
  }

  private readonly handleResize = (gameSize: Phaser.Structs.Size): void => {
    this.configureViewport(gameSize.width, gameSize.height);
  };

  private configureViewport(actualWidth: number, actualHeight: number): void {
    const viewport = getResponsiveViewport(actualWidth, actualHeight);
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

  private reconcileCombatVisuals(now: number, snap: boolean): void {
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
          position: createPointTransition(entity, entity, now),
          angle: createAngleTransition(heading, heading, now)
        });
      } else {
        const fromPoint = snap ? entity : visual.object;
        const fromHeading = snap ? heading : visual.object.rotation;
        if (snap) visual.object.setPosition(entity.x, entity.y).setRotation(heading);
        visual.position = createPointTransition(fromPoint, entity, now);
        visual.angle = createAngleTransition(fromHeading, heading, now);
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
      const rock = this.add.circle(0, 0, entity.radius, 0x766f77, 1).setStrokeStyle(4, 0xbba9a2);
      const crater = this.add.circle(
        -entity.radius * 0.25,
        -entity.radius * 0.2,
        entity.radius * 0.22,
        0x514d59
      );
      container.add([rock, crater]);
    } else if (entity.visualKind === "missile") {
      const body = this.add.rectangle(0, 0, entity.radius * 3.2, entity.radius * 1.3, 0xff704d);
      const trail = this.add.triangle(
        -entity.radius * 2.2,
        0,
        0,
        0,
        entity.radius,
        -entity.radius,
        entity.radius,
        entity.radius,
        0xffd36f,
        0.8
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

type ShapeDrawer = (body: Phaser.GameObjects.Graphics, radius: number) => void;

/** Complete over EnemyShape, so a new shape fails to compile instead of vanishing. */
const ENEMY_SHAPE_DRAWERS: Record<EnemyShape, ShapeDrawer> = {
  arrowhead(body, radius) {
    const nose = radius * 0.86;
    const tail = radius * 0.64;
    const span = radius * 0.54;
    body.fillTriangle(nose, 0, -tail, -span, -tail, span);
    body.strokeTriangle(nose, 0, -tail, -span, -tail, span);
  },
  block(body, radius) {
    const halfWidth = radius * 0.66;
    const halfHeight = radius * 0.45;
    body.fillRoundedRect(-halfWidth, -halfHeight, halfWidth * 2, halfHeight * 2, radius * 0.21);
    body.strokeRoundedRect(-halfWidth, -halfHeight, halfWidth * 2, halfHeight * 2, radius * 0.21);
    body.fillTriangle(
      radius * 0.82,
      0,
      halfWidth * 0.56,
      -radius * 0.29,
      halfWidth * 0.56,
      radius * 0.29
    );
  },
  diamond(body, radius) {
    const points = [
      new Phaser.Math.Vector2(radius * 1.25, 0),
      new Phaser.Math.Vector2(0, -radius * 0.38),
      new Phaser.Math.Vector2(-radius * 0.7, 0),
      new Phaser.Math.Vector2(0, radius * 0.38)
    ];
    body.fillPoints(points, true);
    body.strokePoints(points, true);
  },
  dart(body, radius) {
    const nose = radius * 1.1;
    const tail = radius * 0.75;
    const span = radius * 0.85;
    body.fillTriangle(nose, 0, -tail, -span, -tail, span);
    body.strokeTriangle(nose, 0, -tail, -span, -tail, span);
    body.fillTriangle(-tail * 0.2, 0, -tail, -span * 0.35, -tail, span * 0.35);
  },
  hexagon(body, radius) {
    body.fillPoints(regularPolygon(6, radius), true);
    body.strokePoints(regularPolygon(6, radius), true);
    body.strokeCircle(0, 0, radius * 0.48);
    body.fillTriangle(radius * 0.95, 0, radius * 0.3, -radius * 0.28, radius * 0.3, radius * 0.28);
  },
  cross(body, radius) {
    const arm = radius * 0.32;
    const reach = radius;
    body.fillRect(-reach, -arm, reach * 2, arm * 2);
    body.fillRect(-arm, -reach, arm * 2, reach * 2);
    body.strokeRect(-reach, -arm, reach * 2, arm * 2);
  },
  ring(body, radius) {
    body.strokeCircle(0, 0, radius);
    body.strokeCircle(0, 0, radius * 0.55);
    body.fillTriangle(radius, 0, radius * 0.35, -radius * 0.3, radius * 0.35, radius * 0.3);
  },
  spike(body, radius) {
    const points = Array.from({ length: 10 }, (_, index) => {
      const angle = (index / 10) * Math.PI * 2;
      const reach = index % 2 === 0 ? radius : radius * 0.5;
      return new Phaser.Math.Vector2(Math.cos(angle) * reach, Math.sin(angle) * reach);
    });
    body.fillPoints(points, true);
    body.strokePoints(points, true);
  }
};

function regularPolygon(sides: number, radius: number): Phaser.Math.Vector2[] {
  return Array.from({ length: sides }, (_, index) => {
    const angle = (index / sides) * Math.PI * 2;
    return new Phaser.Math.Vector2(Math.cos(angle) * radius, Math.sin(angle) * radius);
  });
}

const FALLBACK_ENEMY_VISUAL: PublicEnemyCatalogueEntry = {
  kind: "unknown",
  label: "Unknown",
  shape: "arrowhead",
  color: "#e65f4b",
  outline: "#ffd1b0",
  showHealthBar: false
};

export function toColorValue(hex: string): number {
  const parsed = Number.parseInt(hex.replace("#", ""), 16);
  return Number.isFinite(parsed) ? parsed : 0xffffff;
}

/** An archetype the display has no entry for still gets drawn, just generically. */
export function resolveEnemyVisual(
  catalogue: readonly PublicEnemyCatalogueEntry[],
  kind: string
): PublicEnemyCatalogueEntry {
  return catalogue.find((entry) => entry.kind === kind) ?? FALLBACK_ENEMY_VISUAL;
}

export function drawEnemyBody(
  body: Phaser.GameObjects.Graphics,
  visual: PublicEnemyCatalogueEntry,
  radius: number
): void {
  body.fillStyle(toColorValue(visual.color), 1);
  body.lineStyle(3, toColorValue(visual.outline), 0.8);
  // Shape comes from untrusted preset data, so an unknown value still draws.
  const draw = Object.hasOwn(ENEMY_SHAPE_DRAWERS, visual.shape)
    ? ENEMY_SHAPE_DRAWERS[visual.shape]
    : ENEMY_SHAPE_DRAWERS.arrowhead;
  draw(body, radius);
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

function interpolateTransition(transition: PointTransition, now: number): Point {
  return interpolatePoint(
    transition.from,
    transition.to,
    getTimelineAlpha(now - transition.startedAt, SNAPSHOT_TRANSITION_MS)
  );
}

function interpolateAngleTransition(transition: AngleTransition, now: number): number {
  return interpolateAngle(
    transition.from,
    transition.to,
    getTimelineAlpha(now - transition.startedAt, SNAPSHOT_TRANSITION_MS)
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
