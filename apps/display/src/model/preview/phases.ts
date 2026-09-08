import type { PreviewPhase } from "@spaceship-defender/client-shared";
import type { DisplayGameSnapshot } from "@spaceship-defender/protocol";

import {
  EMPTY_TEAM_UPGRADE,
  EMPTY_WORLD_ENTITIES,
  PREVIEW_PURCHASES,
  PREVIEW_WORLD
} from "./world.js";

export function createPreviewGame(
  phase: Exclude<PreviewPhase, "lobby">,
  cameraViewWidth: number
): DisplayGameSnapshot {
  if (phase === "combat") {
    return {
      ...PREVIEW_WORLD,
      shieldPhase: "down",
      cameraViewWidth,
      serverStepMs: 0,
      appliedInputSeq: 0,
      drive: {
        revision: 0,
        speedPerSecond: 320,
        accelerationPerSecondSquared: 640,
        brakingPerSecondSquared: 800,
        reverseSpeedFactor: 0.4,
        headingMaxAngularSpeed: Math.PI,
        headingAngularAcceleration: 50,
        headingAngularBraking: 50,
        turretMaxAngularSpeed: 1.36,
        turretAngularAcceleration: 2.72,
        turretAngularBraking: 4.08,
        hullRadius: 52
      },
      pose: {
        x: 2200,
        y: 2200,
        velocityX: 0,
        velocityY: 0,
        heading: 0,
        turretAngle: 0,
        headingAngularVelocity: 0,
        headingTargetAngle: null,
        turretAngularVelocity: 0,
        turretTargetAngle: null
      },
      shield: {
        angle: Math.PI / 2,
        arcHalfAngle: 0.8,
        rearmRequired: false,
        active: true,
        energy: 64,
        capacity: 120
      },
      cannon: {
        heat: 62,
        capacity: 100,
        overheated: false,
        kind: "kinetic",
        reach: 1500,
        speed: 1000,
        acquireHalfAngle: 0
      },
      machineGun: {
        heat: 46,
        capacity: 100,
        overheated: false,
        kind: "kinetic",
        reach: 620,
        speed: 900
      },
      encounter: {
        phase: "combat",
        outcome: null,
        defeatReason: null,
        waveNumber: 7,
        encounterTick: 240,
        phaseTicksRemaining: 0,
        waveSecondsRemaining: 47,
        lootWindowSecondsRemaining: 0,
        score: 320
      },
      credits: 6,
      teamUpgrade: EMPTY_TEAM_UPGRADE,
      enemyShips: [
        {
          entityId: "preview-enemy-1",
          spawnSequence: 1,
          x: 2820,
          y: 1780,
          velocityX: -60,
          velocityY: 24,
          radius: 46,
          kind: "gunship",
          heading: Math.PI,
          hp: 70,
          maxHp: 90
        },
        {
          entityId: "preview-enemy-2",
          spawnSequence: 2,
          x: 1580,
          y: 2540,
          velocityX: 48,
          velocityY: -30,
          radius: 54,
          kind: "missileCarrier",
          heading: 0,
          hp: 120,
          maxHp: 140
        },
        {
          entityId: "preview-boss",
          spawnSequence: 10,
          x: 2180,
          y: 1420,
          velocityX: -14,
          velocityY: 22,
          radius: 96,
          kind: "boss",
          heading: Math.PI / 2,
          hp: 1420,
          maxHp: 2000
        }
      ],
      lootDrops: [],
      laserBeams: [],
      asteroids: [
        {
          entityId: "preview-asteroid-1",
          origin: "wave",
          spawnSequence: 3,
          x: 2480,
          y: 2860,
          velocityX: -18,
          velocityY: -40,
          radius: 72,
          hp: 60,
          maxHp: 60
        },
        {
          entityId: "preview-asteroid-2",
          origin: "ambient",
          spawnSequence: 9,
          x: 1720,
          y: 1880,
          velocityX: 30,
          velocityY: 24,
          radius: 48,
          hp: 60,
          maxHp: 60
        }
      ],
      friendlyProjectiles: [
        {
          entityId: "preview-friendly-1",
          spawnSequence: 4,
          x: 2440,
          y: 2020,
          velocityX: 420,
          velocityY: -240,
          radius: 10,
          kind: "friendly",
          source: "cannon",
          visual: null
        },
        {
          entityId: "preview-friendly-2",
          spawnSequence: 5,
          x: 2330,
          y: 2110,
          velocityX: 380,
          velocityY: -210,
          radius: 6,
          kind: "friendly",
          source: "machineGun",
          visual: null
        }
      ],
      hostileProjectiles: [
        {
          entityId: "preview-hostile-1",
          spawnSequence: 6,
          x: 2660,
          y: 1960,
          velocityX: -300,
          velocityY: 180,
          radius: 9,
          kind: "hostile",
          visual: null
        }
      ],
      homingMissiles: [
        {
          entityId: "preview-missile-1",
          spawnSequence: 7,
          x: 1820,
          y: 2420,
          velocityX: 200,
          velocityY: -150,
          radius: 14,
          heading: -Math.PI / 5,
          visual: null
        }
      ]
    };
  }
  if (phase === "intermission") {
    return {
      ...PREVIEW_WORLD,
      ...EMPTY_WORLD_ENTITIES,
      shieldPhase: "down",
      cameraViewWidth,
      serverStepMs: 0,
      appliedInputSeq: 0,
      drive: {
        revision: 0,
        speedPerSecond: 320,
        accelerationPerSecondSquared: 640,
        brakingPerSecondSquared: 800,
        reverseSpeedFactor: 0.4,
        headingMaxAngularSpeed: Math.PI,
        headingAngularAcceleration: 50,
        headingAngularBraking: 50,
        turretMaxAngularSpeed: 1.36,
        turretAngularAcceleration: 2.72,
        turretAngularBraking: 4.08,
        hullRadius: 52
      },
      pose: {
        x: 2200,
        y: 2200,
        velocityX: 0,
        velocityY: 0,
        heading: 0,
        turretAngle: 0,
        headingAngularVelocity: 0,
        headingTargetAngle: null,
        turretAngularVelocity: 0,
        turretTargetAngle: null
      },
      shield: {
        angle: 0,
        arcHalfAngle: 0.8,
        rearmRequired: false,
        active: false,
        energy: 120,
        capacity: 120
      },
      cannon: {
        heat: 0,
        capacity: 100,
        overheated: false,
        kind: "kinetic",
        reach: 1500,
        speed: 1000,
        acquireHalfAngle: 0
      },
      machineGun: {
        heat: 0,
        capacity: 100,
        overheated: false,
        kind: "kinetic",
        reach: 620,
        speed: 900
      },
      encounter: {
        phase: "intermission",
        outcome: null,
        defeatReason: null,
        waveNumber: 7,
        encounterTick: 260,
        phaseTicksRemaining: 180,
        waveSecondsRemaining: 0,
        lootWindowSecondsRemaining: 0,
        score: 320
      },
      credits: 6,
      teamUpgrade: {
        offer: {
          offerId: "preview-offer-w7",
          waveNumber: 7,
          tier: 7,
          cards: [
            {
              upgradeId: "afterburner",
              role: "pilot",
              label: "Форсаж",
              effects: [{ target: "spaceshipSpeedPerSecond", op: "percent", value: 0.14 }],
              price: 5
            },
            {
              upgradeId: "turretDrive",
              role: "gunner",
              label: "Привод башни",
              effects: [{ target: "turretMaxAngularSpeedPerSecond", op: "percent", value: 0.25 }],
              price: 5
            },
            {
              upgradeId: "capacitor2",
              role: "shield",
              label: "Батарея повышенной ёмкости",
              effects: [{ target: "shieldCapacity", op: "add", value: 40 }],
              price: 5
            }
          ]
        },
        votes: {
          pilot: { role: "pilot", upgradeId: "turretDrive", revision: 2 },
          gunner: { role: "gunner", upgradeId: "turretDrive", revision: 1 },
          shield: null
        },
        selection: null
      }
    };
  }
  return {
    ...PREVIEW_WORLD,
    ...EMPTY_WORLD_ENTITIES,
    shieldPhase: "down",
    // The ballot below closed on the turret drive, so the result frame owns it.
    purchasedModules: [...PREVIEW_PURCHASES, "turretDrive"],
    cameraViewWidth,
    serverStepMs: 0,
    appliedInputSeq: 0,
    drive: {
      revision: 0,
      speedPerSecond: 320,
      accelerationPerSecondSquared: 640,
      brakingPerSecondSquared: 800,
      reverseSpeedFactor: 0.4,
      headingMaxAngularSpeed: Math.PI,
      headingAngularAcceleration: 50,
      headingAngularBraking: 50,
      turretMaxAngularSpeed: 1.36,
      turretAngularAcceleration: 2.72,
      turretAngularBraking: 4.08,
      hullRadius: 52
    },
    pose: {
      x: 2200,
      y: 2200,
      velocityX: 0,
      velocityY: 0,
      heading: 0,
      turretAngle: 0,
      headingAngularVelocity: 0,
      headingTargetAngle: null,
      turretAngularVelocity: 0,
      turretTargetAngle: null
    },
    spaceship: { ...PREVIEW_WORLD.spaceship, hp: 0, velocityX: 0, velocityY: 0 },
    shield: {
      angle: 0,
      arcHalfAngle: 0.8,
      rearmRequired: false,
      active: false,
      energy: 0,
      capacity: 120
    },
    cannon: {
      heat: 100,
      capacity: 100,
      overheated: true,
      kind: "kinetic",
      reach: 1500,
      speed: 1000,
      acquireHalfAngle: 0
    },
    machineGun: {
      heat: 100,
      capacity: 100,
      overheated: true,
      kind: "kinetic",
      reach: 620,
      speed: 900
    },
    encounter: {
      phase: "result",
      outcome: "defeat",
      defeatReason: "spaceship_destroyed",
      waveNumber: 8,
      encounterTick: 520,
      phaseTicksRemaining: 0,
      waveSecondsRemaining: 0,
      lootWindowSecondsRemaining: 0,
      score: 610
    },
    credits: 11,
    teamUpgrade: EMPTY_TEAM_UPGRADE
  };
}
