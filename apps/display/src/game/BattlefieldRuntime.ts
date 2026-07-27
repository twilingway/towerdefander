import type { PublicGameSnapshot, PublicPlayerView } from "@town-defenders/protocol";
import Phaser from "phaser";

import { BattlefieldSnapshotFeed, type BattlefieldFrame } from "./battlefieldModel.js";

export interface BattlefieldViewSnapshot {
  readonly game: PublicGameSnapshot;
  readonly players: readonly PublicPlayerView[];
}

interface EnemyVisual {
  readonly container: Phaser.GameObjects.Container;
  readonly body: Phaser.GameObjects.Graphics;
  readonly healthBar: Phaser.GameObjects.Graphics;
  previousHealth: number;
}

class BattlefieldScene extends Phaser.Scene {
  private readonly enemyVisuals = new Map<string, EnemyVisual>();
  private readonly feed = new BattlefieldSnapshotFeed();
  private readonly gateHealthLabels: Phaser.GameObjects.Text[] = [];
  private snapshot: BattlefieldViewSnapshot | undefined;
  private intermissionLabel: Phaser.GameObjects.Text | undefined;

  constructor() {
    super("battlefield");
  }

  create(): void {
    this.drawWorld();
    if (this.snapshot !== undefined) {
      this.reconcile(this.feed.next(this.snapshot.game));
    }
  }

  applySnapshot(snapshot: BattlefieldViewSnapshot): void {
    this.snapshot = snapshot;
    if (this.sys.isActive()) {
      this.reconcile(this.feed.next(snapshot.game));
    }
  }

  prepareHydration(): void {
    this.feed.prepareHydration();
  }

  private drawWorld(): void {
    const world = this.add.graphics();
    world.fillGradientStyle(0x102a24, 0x102a24, 0x071714, 0x071714, 1);
    world.fillRect(0, 0, 1280, 720);

    for (let index = 0; index < 55; index += 1) {
      const x = (index * 137) % 1280;
      const y = (index * 83) % 720;
      world.fillStyle(index % 3 === 0 ? 0x183e32 : 0x123128, 0.9);
      world.fillCircle(x, y, 10 + (index % 5) * 3);
    }

    [235, 500].forEach((laneY, sectorId) => {
      world.fillStyle(0x071310, 0.78);
      world.fillRoundedRect(70, laneY - 78, 1140, 156, 38);
      world.lineStyle(4, sectorId === 0 ? 0x59c7a3 : 0x6a9fd8, 0.65);
      world.strokeRoundedRect(82, laneY - 64, 1115, 128, 28);
      world.lineStyle(2, 0xd9b871, 0.24);
      world.lineBetween(120, laneY, 1060, laneY);

      this.drawGate(world, 1110, laneY);
      this.drawTower(world, 1018, laneY);
      this.add
        .text(95, laneY - 55, `СЕКТОР ${String(sectorId + 1)}`, {
          color: sectorId === 0 ? "#7de0bf" : "#8dc4ff",
          fontFamily: "Inter, sans-serif",
          fontSize: "20px",
          fontStyle: "bold"
        })
        .setDepth(2);
      this.gateHealthLabels.push(
        this.add
          .text(1160, laneY, "100", {
            color: "#f6e8bd",
            fontFamily: "Inter, sans-serif",
            fontSize: "18px",
            fontStyle: "bold"
          })
          .setOrigin(0.5)
          .setDepth(2)
      );
    });

    this.intermissionLabel = this.add
      .text(640, 360, "", {
        align: "center",
        color: "#fff4d0",
        fontFamily: "Inter, sans-serif",
        fontSize: "44px",
        fontStyle: "bold",
        stroke: "#06110f",
        strokeThickness: 8
      })
      .setOrigin(0.5)
      .setDepth(20);
  }

  private drawGate(graphics: Phaser.GameObjects.Graphics, x: number, y: number): void {
    graphics.fillStyle(0x807561, 1);
    graphics.fillRoundedRect(x, y - 58, 70, 116, 8);
    graphics.fillStyle(0x302d28, 1);
    graphics.fillRoundedRect(x + 15, y - 35, 40, 93, 16);
    graphics.lineStyle(4, 0xbcae8e, 0.8);
    graphics.strokeRoundedRect(x, y - 58, 70, 116, 8);
  }

  private drawTower(graphics: Phaser.GameObjects.Graphics, x: number, y: number): void {
    graphics.fillStyle(0x64736b, 1);
    graphics.fillCircle(x, y, 36);
    graphics.fillStyle(0xe6b85c, 1);
    graphics.fillCircle(x, y, 14);
    graphics.lineStyle(8, 0xcbd2c8, 1);
    graphics.lineBetween(x - 6, y, x - 58, y);
  }

  private reconcile(frame: BattlefieldFrame): void {
    const { snapshot, airstrikeEffect } = frame;
    const activeIds = new Set(snapshot.enemies.map((enemy) => enemy.enemyId));

    snapshot.enemies.forEach((enemy) => {
      const laneY = enemy.sectorId === 0 ? 235 : 500;
      const x = 125 + (Math.min(snapshot.pathLength, enemy.progress) / snapshot.pathLength) * 850;
      let visual = this.enemyVisuals.get(enemy.enemyId);
      if (visual === undefined) {
        visual = this.createEnemyVisual(enemy.enemyType, enemy.health);
        visual.container.setPosition(x, laneY);
        this.enemyVisuals.set(enemy.enemyId, visual);
      } else {
        if (enemy.health < visual.previousHealth) {
          this.showProjectile(enemy.sectorId, visual.container.x, laneY);
          this.tweens.add({
            targets: visual.body,
            alpha: 0.25,
            yoyo: true,
            duration: 90
          });
        }
        this.tweens.killTweensOf(visual.container);
        this.tweens.add({
          targets: visual.container,
          x,
          y: laneY,
          duration: 650,
          ease: "Sine.Out"
        });
      }
      visual.previousHealth = enemy.health;
      this.drawEnemyHealth(visual.healthBar, enemy.health / enemy.maxHealth);
    });

    for (const [enemyId, visual] of this.enemyVisuals) {
      if (activeIds.has(enemyId)) {
        continue;
      }
      this.enemyVisuals.delete(enemyId);
      this.tweens.add({
        targets: visual.container,
        alpha: 0,
        scale: 1.7,
        duration: 220,
        onComplete: () => {
          visual.container.destroy();
        }
      });
    }

    snapshot.sectors.forEach((sector) => {
      const label = this.gateHealthLabels[sector.sectorId];
      label?.setText(`${String(sector.gateHealth)}/${String(sector.gateMaxHealth)}`);
      label?.setColor(sector.gateHealth < 35 ? "#ff8f83" : "#f6e8bd");
    });

    if (this.intermissionLabel !== undefined) {
      this.intermissionLabel
        .setVisible(snapshot.stage === "intermission")
        .setText(
          `ВОЛНА ${String(snapshot.waveNumber)}\n${String(snapshot.intermissionRemainingSeconds)}`
        );
    }

    if (airstrikeEffect !== null) {
      this.showAirstrike(airstrikeEffect.targetSectorId);
    }
  }

  private createEnemyVisual(
    enemyType: PublicGameSnapshot["enemies"][number]["enemyType"],
    health: number
  ): EnemyVisual {
    const container = this.add.container(0, 0).setDepth(5);
    const body = this.add.graphics();
    const healthBar = this.add.graphics();
    const style = {
      balanced: { color: 0xd8754f, size: 22 },
      fast: { color: 0xf0c35a, size: 17 },
      heavy: { color: 0x9c6bc2, size: 29 },
      boss: { color: 0xe94352, size: 42 }
    }[enemyType];

    body.fillStyle(style.color, 1);
    if (enemyType === "fast") {
      body.fillTriangle(-style.size, style.size, style.size, 0, -style.size, -style.size);
    } else if (enemyType === "heavy") {
      body.fillRoundedRect(-style.size, -style.size, style.size * 2, style.size * 2, 6);
    } else if (enemyType === "boss") {
      body.fillCircle(0, 0, style.size);
      body.fillTriangle(-style.size, -10, -style.size - 18, -34, -8, -style.size);
      body.fillTriangle(style.size, -10, style.size + 18, -34, 8, -style.size);
      const label = this.add
        .text(0, -58, "БОСС", {
          color: "#ffd4d8",
          fontFamily: "Inter, sans-serif",
          fontSize: "16px",
          fontStyle: "bold"
        })
        .setOrigin(0.5);
      container.add(label);
    } else {
      body.fillCircle(0, 0, style.size);
    }
    body.lineStyle(4, 0x180d0c, 0.7);
    body.strokeCircle(0, 0, style.size);
    container.add([body, healthBar]);
    this.drawEnemyHealth(healthBar, health > 0 ? 1 : 0);
    return { container, body, healthBar, previousHealth: health };
  }

  private drawEnemyHealth(graphics: Phaser.GameObjects.Graphics, ratio: number): void {
    graphics.clear();
    graphics.fillStyle(0x210e0e, 0.95);
    graphics.fillRoundedRect(-28, -38, 56, 7, 3);
    graphics.fillStyle(ratio < 0.35 ? 0xff665e : 0x68d391, 1);
    graphics.fillRoundedRect(-28, -38, 56 * Math.max(0, ratio), 7, 3);
  }

  private showProjectile(sectorId: number, targetX: number, laneY: number): void {
    const projectile = this.add.circle(1000, laneY, 6, 0xffe18f, 1).setDepth(9);
    this.tweens.add({
      targets: projectile,
      x: targetX,
      duration: 160,
      onComplete: () => {
        projectile.destroy();
      }
    });
    const muzzle = this.add.circle(980, sectorId === 0 ? 235 : 500, 16, 0xffd46d, 0.8);
    this.tweens.add({
      targets: muzzle,
      alpha: 0,
      scale: 2,
      duration: 140,
      onComplete: () => {
        muzzle.destroy();
      }
    });
  }

  private showAirstrike(sectorId: number): void {
    const laneY = sectorId === 0 ? 235 : 500;
    const flash = this.add.rectangle(640, laneY, 1140, 150, 0xffd36c, 0.7).setDepth(15);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 520,
      onComplete: () => {
        flash.destroy();
      }
    });
    for (let index = 0; index < 8; index += 1) {
      const blast = this.add
        .circle(180 + index * 115, laneY + (index % 2 === 0 ? -22 : 20), 18, 0xff693d, 0.9)
        .setDepth(16);
      this.tweens.add({
        targets: blast,
        scale: 3,
        alpha: 0,
        duration: 360 + index * 22,
        onComplete: () => {
          blast.destroy();
        }
      });
    }
  }
}

export interface BattlefieldRuntime {
  update(snapshot: BattlefieldViewSnapshot): void;
  prepareHydration(): void;
  destroy(): void;
}

export function createBattlefieldRuntime(
  parent: HTMLElement,
  initialSnapshot: BattlefieldViewSnapshot
): BattlefieldRuntime {
  const scene = new BattlefieldScene();
  scene.applySnapshot(initialSnapshot);
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: 1280,
    height: 720,
    backgroundColor: "#071714",
    transparent: false,
    scene,
    render: { antialias: true, pixelArt: false },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH
    }
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
