import type {
  DisplayGameSnapshot,
  EnemyKind,
  PublicAsteroidView,
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

type CombatEntity =
  | (PublicEnemyView & { readonly visualKind: "enemy" })
  | (PublicAsteroidView & { readonly visualKind: "asteroid" })
  | (PublicProjectileView & { readonly visualKind: "projectile" })
  | (PublicHomingMissileView & { readonly visualKind: "missile" });

interface CombatVisual {
  readonly object: Phaser.GameObjects.Container;
  position: PointTransition;
  angle: AngleTransition;
}

class SpaceshipScene extends Phaser.Scene {
  private snapshot: DisplayGameSnapshot;
  private spaceshipBody: Phaser.GameObjects.Graphics | undefined;
  private turret: Phaser.GameObjects.Rectangle | undefined;
  private shield: Phaser.GameObjects.Graphics | undefined;
  private visualShieldAngle: number;
  private spaceshipTransition: PointTransition;
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
    this.drawGrid();
    this.drawDecorations();

    this.spaceshipBody = this.add.graphics().setDepth(10);
    this.spaceshipBody.fillStyle(0x7dd8c4, 1);
    this.spaceshipBody.fillCircle(0, 0, this.snapshot.spaceship.radius);
    this.spaceshipBody.lineStyle(7, 0x153b43, 1);
    this.spaceshipBody.strokeCircle(0, 0, this.snapshot.spaceship.radius);
    this.spaceshipBody.fillStyle(0xe8be67, 1);
    this.spaceshipBody.fillCircle(0, 0, 18);
    this.spaceshipBody.setPosition(this.snapshot.spaceship.x, this.snapshot.spaceship.y);

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
    this.turret.setPosition(spaceshipPosition.x, spaceshipPosition.y);
    this.turret.rotation = interpolateAngleTransition(this.turretTransition, now);
    this.visualShieldAngle = interpolateAngleTransition(this.shieldTransition, now);
    this.drawShield();
    this.focusCamera(spaceshipPosition);

    for (const visual of this.combatVisuals.values()) {
      const position = interpolateTransition(visual.position, now);
      visual.object.setPosition(position.x, position.y);
      visual.object.rotation = interpolateAngleTransition(visual.angle, now);
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

  private drawGrid(): void {
    this.cameras.main.setBackgroundColor(0x07171f);
    const graphics = this.add.graphics().setDepth(0);
    graphics.lineStyle(2, 0x163746, 0.75);
    for (let x = 0; x <= this.snapshot.worldWidth; x += 100)
      graphics.lineBetween(x, 0, x, this.snapshot.worldHeight);
    for (let y = 0; y <= this.snapshot.worldHeight; y += 100)
      graphics.lineBetween(0, y, this.snapshot.worldWidth, y);
    graphics.lineStyle(8, 0x3d6874, 1);
    graphics.strokeRect(0, 0, this.snapshot.worldWidth, this.snapshot.worldHeight);
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
    this.turret.setPosition(snapshot.spaceship.x, snapshot.spaceship.y);
    this.turret.setRotation(snapshot.turretAngle);
    this.visualShieldAngle = snapshot.shield.angle;
    const transitions = createSnappedVisualTransitions(snapshot, now);
    this.spaceshipTransition = transitions.spaceship;
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
        const object = this.createCombatVisual(entity).setPosition(entity.x, entity.y);
        object.rotation = heading;
        this.combatVisuals.set(entityId, {
          object,
          position: createPointTransition(entity, entity, now),
          angle: createAngleTransition(heading, heading, now)
        });
      } else {
        const fromPoint = snap ? entity : visual.object;
        const fromHeading = snap ? heading : visual.object.rotation;
        if (snap) visual.object.setPosition(entity.x, entity.y).setRotation(heading);
        visual.position = createPointTransition(fromPoint, entity, now);
        visual.angle = createAngleTransition(fromHeading, heading, now);
      }
    }
  }

  private createCombatVisual(entity: CombatEntity): Phaser.GameObjects.Container {
    const container = this.add.container(entity.x, entity.y).setDepth(getEntityDepth(entity));
    if (entity.visualKind === "enemy") {
      const body = this.add.graphics();
      const color = getEnemyColor(entity.kind);
      body.fillStyle(color, 1);
      body.lineStyle(3, 0xffd1b0, 0.8);
      if (entity.kind === "gunship") {
        body.fillTriangle(24, 0, -18, -15, -18, 15);
        body.strokeTriangle(24, 0, -18, -15, -18, 15);
      } else {
        body.fillRoundedRect(-25, -17, 50, 34, 8);
        body.strokeRoundedRect(-25, -17, 50, 34, 8);
        body.fillTriangle(31, 0, 14, -11, 14, 11);
      }
      container.add(body);
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
      const friendly = entity.kind === "friendly";
      const bullet = this.add
        .circle(0, 0, entity.radius, friendly ? 0xffd36f : 0xff685f, 1)
        .setStrokeStyle(2, friendly ? 0xfff1b2 : 0xffc2bd);
      container.add(bullet);
    }
    return container;
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

function getEnemyColor(kind: EnemyKind): number {
  return kind === "gunship" ? 0xe65f4b : 0xaa5bd6;
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
