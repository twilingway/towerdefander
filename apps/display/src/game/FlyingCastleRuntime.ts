import type { DisplayGameSnapshot, PublicProjectileView } from "@town-defenders/protocol";
import Phaser from "phaser";

import { getBoundedCameraScroll, interpolatePoint } from "./flyingCastleViewModel.js";

const VIEWPORT_WIDTH = 1280;
const VIEWPORT_HEIGHT = 720;
const LERP = 0.24;

class FlyingCastleScene extends Phaser.Scene {
  private snapshot: DisplayGameSnapshot;
  private castleBody: Phaser.GameObjects.Graphics | undefined;
  private turret: Phaser.GameObjects.Rectangle | undefined;
  private shield: Phaser.GameObjects.Graphics | undefined;
  private visualShieldAngle: number;
  private readonly projectiles = new Map<string, Phaser.GameObjects.Arc>();

  constructor(snapshot: DisplayGameSnapshot) {
    super("flying-castle");
    this.snapshot = snapshot;
    this.visualShieldAngle = snapshot.shield.angle;
  }

  create(): void {
    this.cameras.main.setBounds(0, 0, this.snapshot.worldWidth, this.snapshot.worldHeight);
    const initialScroll = getBoundedCameraScroll(
      this.snapshot.castle,
      this.snapshot.worldWidth,
      this.snapshot.worldHeight,
      VIEWPORT_WIDTH,
      VIEWPORT_HEIGHT
    );
    this.cameras.main.setScroll(initialScroll.x, initialScroll.y);
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
    this.drawShield();
    this.cameras.main.startFollow(this.castleBody, true, 0.12, 0.12);
    this.reconcileProjectiles();
  }

  override update(): void {
    if (this.castleBody === undefined || this.turret === undefined || this.shield === undefined)
      return;
    const castlePosition = interpolatePoint(this.castleBody, this.snapshot.castle, LERP);
    this.castleBody.x = castlePosition.x;
    this.castleBody.y = castlePosition.y;
    this.turret.x = this.castleBody.x;
    this.turret.y = this.castleBody.y;
    this.turret.rotation = Phaser.Math.Angle.RotateTo(
      this.turret.rotation,
      this.snapshot.turretAngle,
      0.18
    );
    this.visualShieldAngle = Phaser.Math.Angle.RotateTo(
      this.visualShieldAngle,
      this.snapshot.shield.angle,
      0.18
    );
    this.drawShield();

    const targets = new Map(
      this.snapshot.projectiles.map((projectile) => [projectile.projectileId, projectile])
    );
    for (const [projectileId, visual] of this.projectiles) {
      const target = targets.get(projectileId);
      if (target !== undefined) {
        visual.x = Phaser.Math.Linear(visual.x, target.x, 0.35);
        visual.y = Phaser.Math.Linear(visual.y, target.y, 0.35);
      }
    }
  }

  applySnapshot(snapshot: DisplayGameSnapshot): void {
    this.snapshot = snapshot;
    if (this.sys.isActive()) this.reconcileProjectiles();
  }

  prepareHydration(): void {
    for (const projectile of this.projectiles.values()) projectile.destroy();
    this.projectiles.clear();
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
    if (!this.snapshot.shield.active) return;
    this.shield.lineStyle(16, 0x65baff, 0.9);
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

  private reconcileProjectiles(): void {
    const incoming = new Set(
      this.snapshot.projectiles.map((projectile) => projectile.projectileId)
    );
    for (const [projectileId, visual] of this.projectiles) {
      if (!incoming.has(projectileId)) {
        visual.destroy();
        this.projectiles.delete(projectileId);
      }
    }
    for (const projectile of this.snapshot.projectiles) {
      if (!this.projectiles.has(projectile.projectileId)) {
        this.projectiles.set(projectile.projectileId, this.createProjectile(projectile));
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
    width: VIEWPORT_WIDTH,
    height: VIEWPORT_HEIGHT,
    backgroundColor: "#07171f",
    scene,
    render: { antialias: true, roundPixels: true },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }
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
