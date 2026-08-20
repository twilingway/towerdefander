import type { DisplayGameSnapshot, PublicProjectileView } from "@town-defenders/protocol";
import Phaser from "phaser";

import {
  createAngleTransition,
  createPointTransition,
  createSnappedVisualTransitions,
  getCameraOverscan,
  getPhaserCameraScroll,
  getResponsiveViewport,
  getShieldVisualStyle,
  getTimelineAlpha,
  interpolateAngle,
  interpolatePoint,
  SnapshotResetLatch,
  type AngleTransition,
  type Point,
  type PointTransition
} from "./flyingCastleViewModel.js";

const BASE_VIEWPORT_WIDTH = 1600;
const BASE_VIEWPORT_HEIGHT = 900;
const SNAPSHOT_TRANSITION_MS = 50;

class FlyingCastleScene extends Phaser.Scene {
  private snapshot: DisplayGameSnapshot;
  private castleBody: Phaser.GameObjects.Graphics | undefined;
  private turret: Phaser.GameObjects.Rectangle | undefined;
  private shield: Phaser.GameObjects.Graphics | undefined;
  private visualShieldAngle: number;
  private castleTransition: PointTransition;
  private turretTransition: AngleTransition;
  private shieldTransition: AngleTransition;
  private readonly snapshotReset = new SnapshotResetLatch();
  private readonly projectiles = new Map<string, Phaser.GameObjects.Arc>();
  private readonly projectileTransitions = new Map<string, PointTransition>();
  private viewportWidth = BASE_VIEWPORT_WIDTH;
  private viewportHeight = BASE_VIEWPORT_HEIGHT;
  private rendererWidth = BASE_VIEWPORT_WIDTH;
  private rendererHeight = BASE_VIEWPORT_HEIGHT;
  private cameraOverscan = 0;

  constructor(snapshot: DisplayGameSnapshot) {
    super("flying-castle");
    this.snapshot = snapshot;
    this.visualShieldAngle = snapshot.shield.angle;
    this.castleTransition = createPointTransition(snapshot.castle, snapshot.castle, 0);
    this.turretTransition = createAngleTransition(snapshot.turretAngle, snapshot.turretAngle, 0);
    this.shieldTransition = createAngleTransition(snapshot.shield.angle, snapshot.shield.angle, 0);
  }

  create(): void {
    this.configureViewport(this.scale.gameSize.width, this.scale.gameSize.height);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    });
    this.focusCamera(this.snapshot.castle);
    this.drawGrid();
    this.drawDecorations();

    this.castleBody = this.add.graphics().setDepth(10);
    this.castleBody.fillStyle(0x7dd8c4, 1);
    this.castleBody.fillCircle(0, 0, this.snapshot.castle.radius);
    this.castleBody.lineStyle(7, 0x153b43, 1);
    this.castleBody.strokeCircle(0, 0, this.snapshot.castle.radius);
    this.castleBody.fillStyle(0xe8be67, 1);
    this.castleBody.fillCircle(0, 0, 18);
    this.castleBody.setPosition(this.snapshot.castle.x, this.snapshot.castle.y);

    this.turret = this.add
      .rectangle(this.snapshot.castle.x, this.snapshot.castle.y, 92, 16, 0xffd36f)
      .setOrigin(0.16, 0.5)
      .setDepth(12)
      .setRotation(this.snapshot.turretAngle);
    this.shield = this.add.graphics().setDepth(14);
    const now = performance.now();
    this.snapToSnapshot(this.snapshot, now);
    this.drawShield();
    this.reconcileProjectiles(now, true);
  }

  override update(): void {
    if (this.castleBody === undefined || this.turret === undefined || this.shield === undefined)
      return;
    const now = performance.now();
    const castlePosition = interpolateTransition(this.castleTransition, now);
    this.castleBody.x = castlePosition.x;
    this.castleBody.y = castlePosition.y;
    this.turret.x = this.castleBody.x;
    this.turret.y = this.castleBody.y;
    this.turret.rotation = interpolateAngleTransition(this.turretTransition, now);
    this.visualShieldAngle = interpolateAngleTransition(this.shieldTransition, now);
    this.drawShield();

    this.focusCamera(castlePosition);

    for (const [projectileId, visual] of this.projectiles) {
      const transition = this.projectileTransitions.get(projectileId);
      if (transition === undefined) continue;
      const position = interpolateTransition(transition, now);
      visual.x = position.x;
      visual.y = position.y;
    }
  }

  applySnapshot(snapshot: DisplayGameSnapshot): void {
    this.snapshot = snapshot;
    const shouldSnap = this.snapshotReset.consumeForSnapshot();
    if (!this.sys.isActive()) return;
    const now = performance.now();
    if (shouldSnap || this.castleBody === undefined || this.turret === undefined) {
      this.snapToSnapshot(snapshot, now);
    } else {
      this.castleTransition = createPointTransition(this.castleBody, snapshot.castle, now);
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
    this.reconcileProjectiles(now, shouldSnap);
  }

  prepareHydration(): void {
    for (const projectile of this.projectiles.values()) projectile.destroy();
    this.projectiles.clear();
    this.projectileTransitions.clear();
    this.snapshotReset.request();
  }

  private drawGrid(): void {
    this.cameras.main.setBackgroundColor(0x07171f);
    const graphics = this.add.graphics().setDepth(0);
    graphics.lineStyle(2, 0x163746, 0.75);
    for (let x = 0; x <= this.snapshot.worldWidth; x += 100) {
      graphics.lineBetween(x, 0, x, this.snapshot.worldHeight);
    }
    for (let y = 0; y <= this.snapshot.worldHeight; y += 100) {
      graphics.lineBetween(0, y, this.snapshot.worldWidth, y);
    }
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
    if (this.shield === undefined || this.castleBody === undefined) return;
    this.shield.clear();
    this.shield.setPosition(this.castleBody.x, this.castleBody.y);
    const style = getShieldVisualStyle(this.snapshot.shield.active);
    this.shield.lineStyle(style.lineWidth, style.color, style.alpha);
    this.shield.beginPath();
    this.shield.arc(
      0,
      0,
      this.snapshot.castle.radius + 34,
      this.visualShieldAngle - 0.72,
      this.visualShieldAngle + 0.72,
      false
    );
    this.shield.strokePath();
  }

  private snapToSnapshot(snapshot: DisplayGameSnapshot, now: number): void {
    if (this.castleBody === undefined || this.turret === undefined) return;
    this.castleBody.setPosition(snapshot.castle.x, snapshot.castle.y);
    this.turret.setPosition(snapshot.castle.x, snapshot.castle.y);
    this.turret.setRotation(snapshot.turretAngle);
    this.visualShieldAngle = snapshot.shield.angle;
    const transitions = createSnappedVisualTransitions(snapshot, now);
    this.castleTransition = transitions.castle;
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
    this.cameraOverscan = getCameraOverscan(this.snapshot.castle.radius, viewport.zoom);
    this.cameras.main.setZoom(viewport.zoom);
    this.cameras.main.setBounds(
      -this.cameraOverscan,
      -this.cameraOverscan,
      this.snapshot.worldWidth + this.cameraOverscan * 2,
      this.snapshot.worldHeight + this.cameraOverscan * 2
    );
    this.focusCamera(this.castleBody ?? this.snapshot.castle);
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

  private reconcileProjectiles(now: number, snap: boolean): void {
    const incoming = new Set(
      this.snapshot.projectiles.map((projectile) => projectile.projectileId)
    );
    for (const [projectileId, visual] of this.projectiles) {
      if (!incoming.has(projectileId)) {
        visual.destroy();
        this.projectiles.delete(projectileId);
        this.projectileTransitions.delete(projectileId);
      }
    }
    for (const projectile of this.snapshot.projectiles) {
      const visual = this.projectiles.get(projectile.projectileId);
      if (visual === undefined) {
        const created = this.createProjectile(projectile);
        this.projectiles.set(projectile.projectileId, created);
        this.projectileTransitions.set(
          projectile.projectileId,
          createPointTransition(projectile, projectile, now)
        );
      } else {
        const from = snap ? projectile : visual;
        if (snap) visual.setPosition(projectile.x, projectile.y);
        this.projectileTransitions.set(
          projectile.projectileId,
          createPointTransition(from, projectile, now)
        );
      }
    }
  }

  private createProjectile(projectile: PublicProjectileView): Phaser.GameObjects.Arc {
    return this.add
      .circle(projectile.x, projectile.y, projectile.radius, 0xffd36f, 1)
      .setStrokeStyle(3, 0xfff1b2)
      .setDepth(11);
  }
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

export interface FlyingCastleRuntime {
  update(snapshot: DisplayGameSnapshot): void;
  prepareHydration(): void;
  destroy(): void;
}

export function createFlyingCastleRuntime(
  host: HTMLElement,
  initialSnapshot: DisplayGameSnapshot
): FlyingCastleRuntime {
  const scene = new FlyingCastleScene(initialSnapshot);
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
