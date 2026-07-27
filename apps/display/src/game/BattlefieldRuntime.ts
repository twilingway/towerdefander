import type { PublicGameSnapshot, PublicPlayerView } from "@town-defenders/protocol";
import Phaser from "phaser";

import { BattlefieldSnapshotFeed, type BattlefieldFrame } from "./battlefieldModel.js";
import {
  BATTLEFIELD_HEIGHT,
  BATTLEFIELD_WIDTH,
  CASTLE_ENVIRONMENT_KEY,
  CASTLE_ENVIRONMENT_URL,
  CASTLE_LAYOUT,
  EnvironmentLayerController,
  getLanePoint,
  getWorldPoint,
  type EnvironmentLayerState
} from "./castleLayout.js";

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
  private readonly environmentLayer: EnvironmentLayerController;
  private readonly feed = new BattlefieldSnapshotFeed();
  private readonly gateHealthLabels: Phaser.GameObjects.Text[] = [];
  private fallbackWorld: Phaser.GameObjects.Graphics | undefined;
  private snapshot: BattlefieldViewSnapshot | undefined;
  private intermissionLabel: Phaser.GameObjects.Text | undefined;

  constructor(onEnvironmentStateChange: (state: EnvironmentLayerState) => void) {
    super("battlefield");
    this.environmentLayer = new EnvironmentLayerController(onEnvironmentStateChange);
  }

  create(): void {
    this.drawWorld();
    this.startEnvironmentLoad();
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
    const world = this.add.graphics().setDepth(0);
    this.fallbackWorld = world;
    world.fillGradientStyle(0x102a24, 0x102a24, 0x071714, 0x071714, 1);
    world.fillRect(0, 0, BATTLEFIELD_WIDTH, BATTLEFIELD_HEIGHT);

    for (let index = 0; index < 55; index += 1) {
      const x = (index * 137) % BATTLEFIELD_WIDTH;
      const y = (index * 83) % BATTLEFIELD_HEIGHT;
      world.fillStyle(index % 3 === 0 ? 0x183e32 : 0x123128, 0.9);
      world.fillCircle(x, y, 10 + (index % 5) * 3);
    }

    this.drawFallbackCastle(world);

    ([0, 1] as const).forEach((sectorId) => {
      let previous = getLanePoint(sectorId, 0, 1);
      world.lineStyle(92, 0x322b20, 0.82);
      for (let index = 1; index <= 32; index += 1) {
        const next = getLanePoint(sectorId, index / 32, 1);
        world.lineBetween(previous.x, previous.y, next.x, next.y);
        previous = next;
      }
      previous = getLanePoint(sectorId, 0, 1);
      world.lineStyle(72, 0x9a7345, 1);
      for (let index = 1; index <= 32; index += 1) {
        const next = getLanePoint(sectorId, index / 32, 1);
        world.lineBetween(previous.x, previous.y, next.x, next.y);
        previous = next;
      }

      const gate = getWorldPoint(CASTLE_LAYOUT[sectorId].gate);
      const tower = getWorldPoint(CASTLE_LAYOUT[sectorId].tower);
      const label = getWorldPoint(CASTLE_LAYOUT[sectorId].label);
      this.drawGate(world, gate.x, gate.y);
      this.drawTower(world, tower.x, tower.y, sectorId);
      this.add
        .text(label.x, label.y, `СЕКТОР ${String(sectorId + 1)}`, {
          color: sectorId === 0 ? "#7de0bf" : "#8dc4ff",
          fontFamily: "Inter, sans-serif",
          fontSize: "20px",
          fontStyle: "bold",
          stroke: "#071714",
          strokeThickness: 6
        })
        .setOrigin(0.5)
        .setDepth(4);
      this.gateHealthLabels.push(
        this.add
          .text(gate.x, gate.y + 64, "100", {
            color: "#f6e8bd",
            fontFamily: "Inter, sans-serif",
            fontSize: "18px",
            fontStyle: "bold",
            stroke: "#071714",
            strokeThickness: 5
          })
          .setOrigin(0.5)
          .setDepth(4)
      );
    });

    this.intermissionLabel = this.add
      .text(BATTLEFIELD_WIDTH / 2, 655, "", {
        align: "center",
        color: "#fff4d0",
        fontFamily: "Inter, sans-serif",
        fontSize: "38px",
        fontStyle: "bold",
        stroke: "#06110f",
        strokeThickness: 8
      })
      .setOrigin(0.5)
      .setDepth(20);
  }

  private drawGate(graphics: Phaser.GameObjects.Graphics, x: number, y: number): void {
    graphics.fillStyle(0x807561, 1);
    graphics.fillRoundedRect(x - 35, y - 58, 70, 116, 8);
    graphics.fillStyle(0x302d28, 1);
    graphics.fillRoundedRect(x - 20, y - 35, 40, 93, 16);
    graphics.lineStyle(4, 0xbcae8e, 0.8);
    graphics.strokeRoundedRect(x - 35, y - 58, 70, 116, 8);
  }

  private drawTower(
    graphics: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    sectorId: 0 | 1
  ): void {
    graphics.fillStyle(0x64736b, 1);
    graphics.fillCircle(x, y, 36);
    graphics.fillStyle(0xe6b85c, 1);
    graphics.fillCircle(x, y, 14);
    graphics.lineStyle(8, 0xcbd2c8, 1);
    graphics.lineBetween(x + (sectorId === 0 ? -6 : 6), y, x + (sectorId === 0 ? -58 : 58), y);
  }

  private drawFallbackCastle(graphics: Phaser.GameObjects.Graphics): void {
    graphics.fillStyle(0x47534f, 1);
    graphics.fillRoundedRect(450, 155, 380, 315, 22);
    graphics.fillStyle(0x2a3533, 1);
    graphics.fillRoundedRect(515, 105, 250, 345, 18);
    graphics.fillStyle(0xc99746, 0.9);
    for (const x of [545, 610, 675, 740]) {
      graphics.fillRoundedRect(x, 190, 18, 34, 7);
      graphics.fillRoundedRect(x, 280, 18, 34, 7);
    }
    graphics.lineStyle(8, 0x89928a, 0.8);
    graphics.strokeRoundedRect(450, 155, 380, 315, 22);
  }

  private startEnvironmentLoad(): void {
    if (this.textures.exists(CASTLE_ENVIRONMENT_KEY)) {
      this.resolveEnvironment();
      return;
    }

    this.load.once(Phaser.Loader.Events.COMPLETE, () => {
      this.resolveEnvironment();
    });
    this.load.image(CASTLE_ENVIRONMENT_KEY, CASTLE_ENVIRONMENT_URL);
    this.load.start();
  }

  private resolveEnvironment(): void {
    this.environmentLayer.resolve(this.textures.exists(CASTLE_ENVIRONMENT_KEY), () => {
      let environment: Phaser.GameObjects.Image | undefined;
      try {
        environment = this.add.image(
          BATTLEFIELD_WIDTH / 2,
          BATTLEFIELD_HEIGHT / 2,
          CASTLE_ENVIRONMENT_KEY
        );
        environment.setDisplaySize(BATTLEFIELD_WIDTH, BATTLEFIELD_HEIGHT).setDepth(1);
        this.fallbackWorld?.setVisible(false);
      } catch (error) {
        environment?.destroy();
        this.fallbackWorld?.setVisible(true);
        throw error;
      }
    });
  }

  private reconcile(frame: BattlefieldFrame): void {
    const { snapshot, airstrikeEffect } = frame;
    const activeIds = new Set(snapshot.enemies.map((enemy) => enemy.enemyId));

    snapshot.enemies.forEach((enemy) => {
      const sectorId: 0 | 1 = enemy.sectorId === 1 ? 1 : 0;
      const point = getLanePoint(sectorId, enemy.progress, snapshot.pathLength);
      let visual = this.enemyVisuals.get(enemy.enemyId);
      if (visual === undefined) {
        visual = this.createEnemyVisual(enemy.enemyType, enemy.health);
        visual.container.setPosition(point.x, point.y);
        this.enemyVisuals.set(enemy.enemyId, visual);
      } else {
        if (enemy.health < visual.previousHealth) {
          this.showProjectile(sectorId, visual.container.x, visual.container.y);
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
          x: point.x,
          y: point.y,
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

  private showProjectile(sectorId: 0 | 1, targetX: number, targetY: number): void {
    const tower = getWorldPoint(CASTLE_LAYOUT[sectorId].tower);
    const projectile = this.add.circle(tower.x, tower.y, 6, 0xffe18f, 1).setDepth(9);
    this.tweens.add({
      targets: projectile,
      x: targetX,
      y: targetY,
      duration: 160,
      onComplete: () => {
        projectile.destroy();
      }
    });
    const muzzle = this.add.circle(tower.x, tower.y, 16, 0xffd46d, 0.8).setDepth(9);
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
    const normalizedSectorId: 0 | 1 = sectorId === 1 ? 1 : 0;
    const laneCenter = getLanePoint(normalizedSectorId, 0.45, 1);
    const flash = this.add
      .ellipse(laneCenter.x, laneCenter.y, 520, 230, 0xffd36c, 0.58)
      .setDepth(15);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 520,
      onComplete: () => {
        flash.destroy();
      }
    });
    for (let index = 0; index < 8; index += 1) {
      const blastPoint = getLanePoint(normalizedSectorId, 0.1 + index * 0.09, 1);
      const blast = this.add
        .circle(blastPoint.x, blastPoint.y + (index % 2 === 0 ? -22 : 20), 18, 0xff693d, 0.9)
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
  parent.dataset.environmentState = "loading";
  const scene = new BattlefieldScene((state) => {
    parent.dataset.environmentState = state;
  });
  scene.applySnapshot(initialSnapshot);
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: BATTLEFIELD_WIDTH,
    height: BATTLEFIELD_HEIGHT,
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
