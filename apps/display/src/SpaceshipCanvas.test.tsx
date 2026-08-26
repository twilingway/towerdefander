import type { DisplayGameSnapshot } from "@spaceship-defender/protocol";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { SpaceshipRuntime } from "./game/SpaceshipRuntime.js";
import {
  SpaceshipCanvas,
  prepareRuntimeHydration,
  shouldPrepareRuntimeHydration,
  shouldReframeRuntime,
  shouldUpdateRuntime
} from "./SpaceshipCanvas.js";

describe("SpaceshipCanvas", () => {
  it("does not restart Phaser interpolation for a telemetry-only patch", () => {
    expect(shouldUpdateRuntime(42, 42)).toBe(false);
    expect(shouldUpdateRuntime(42, 43)).toBe(true);
  });

  it("reframes the runtime when a held tick keeps a moved camera width", () => {
    expect(shouldUpdateRuntime(240, 240)).toBe(false);
    expect(shouldReframeRuntime(1600, 1600)).toBe(false);
    expect(shouldReframeRuntime(1600, 2400)).toBe(true);
  });

  it("rehydrates exactly once even when reconnect keeps the defeated snapshot tick", () => {
    const prepareHydration = vi.fn();
    const update = vi.fn();
    const runtime: SpaceshipRuntime = {
      prepareHydration,
      update,
      destroy: vi.fn()
    };
    const snapshot = { tick: 42 } as DisplayGameSnapshot;

    expect(shouldUpdateRuntime(42, snapshot.tick)).toBe(false);
    prepareRuntimeHydration(runtime, snapshot);

    expect(prepareHydration).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith(snapshot);
  });

  it("uses a new run as a hydration boundary even when its first tick repeats", () => {
    expect(shouldPrepareRuntimeHydration(1, 2, 0, 0)).toBe(true);
    expect(shouldPrepareRuntimeHydration(2, 2, 0, 0)).toBe(false);
    expect(shouldUpdateRuntime(0, 0)).toBe(false);
  });

  it("coalesces simultaneous reconnect and run changes into one hydration decision", () => {
    expect(shouldPrepareRuntimeHydration(1, 2, 4, 5)).toBe(true);
  });

  it("publishes nearest-target telemetry only when visible demo mode is active", () => {
    const ordinaryMarkup = renderToStaticMarkup(
      <SpaceshipCanvas game={testGame} runNumber={1} connectionEpoch={0} />
    );
    const demoMarkup = renderToStaticMarkup(
      <SpaceshipCanvas game={testGame} runNumber={1} connectionEpoch={0} visibleDemo />
    );

    expect(ordinaryMarkup).not.toContain("data-demo-target");
    expect(demoMarkup).toContain('data-demo-target-id="asteroid-near"');
    expect(demoMarkup).toContain('data-demo-target-x="110"');
    expect(demoMarkup).toContain('data-demo-target-y="100"');
    expect(demoMarkup).toContain('data-demo-target-velocity-x="-2"');
    expect(demoMarkup).toContain('data-demo-target-velocity-y="3"');
  });

  it("publishes the shared economy telemetry with every snapshot", () => {
    const markup = renderToStaticMarkup(
      <SpaceshipCanvas
        game={{
          ...testGame,
          credits: 7,
          encounter: { ...testGame.encounter, waveNumber: 2 },
          teamUpgrade: {
            ...testGame.teamUpgrade,
            selection: {
              offerId: "offer-w1",
              waveNumber: 1,
              upgradeId: "gunner_damage",
              role: "gunner",
              price: 5
            }
          }
        }}
        runNumber={1}
        connectionEpoch={0}
      />
    );

    expect(markup).toContain('data-credits="7"');
    expect(markup).toContain('data-wave-number="2"');
    expect(markup).toContain('data-encounter-phase="combat"');
    // The wave-1 purchase applies to wave 2 and only to wave 2.
    expect(markup).toContain('data-team-upgrade-id="gunner_damage"');
  });
});

const testGame = {
  tick: 1,
  elapsedMs: 50,
  worldWidth: 4400,
  cameraViewWidth: 1600,
  worldHeight: 4400,
  arenaRadius: 2200,
  spaceship: {
    x: 100,
    y: 100,
    velocityX: 0,
    velocityY: 0,
    radius: 52,
    hp: 1000,
    maxHp: 1000,
    heading: Math.PI / 4
  },
  turretAngle: 0,
  shield: { angle: 0, active: false, energy: 100, capacity: 100, arcHalfAngle: 0.72 },
  machineGun: { heat: 0, capacity: 100, overheated: false },
  encounter: {
    phase: "combat",
    outcome: null,
    defeatReason: null,
    waveNumber: 1,
    encounterTick: 1,
    phaseTicksRemaining: 0,
    waveSecondsRemaining: 1200,
    score: 0
  },
  roleModifiers: {
    pilot: { speedMultiplier: 1, accelerationMultiplier: 1, maxHpBonus: 0 },
    gunner: { damageMultiplier: 1, cooldownMultiplier: 1, projectileSpeedMultiplier: 1 },
    shield: { capacityBonus: 0, rechargeMultiplier: 1, arcWidthBonus: 0 }
  },
  credits: 0,
  teamUpgrade: {
    offer: null,
    votes: { pilot: null, gunner: null, shield: null },
    selection: null
  },
  enemyCatalogue: [],
  asteroidVisual: null,
  spaceshipVisual: null,
  shieldRadius: 104,
  obstacles: [],
  enemyShips: [],
  asteroids: [
    {
      entityId: "asteroid-near",
      origin: "wave",
      spawnSequence: 1,
      x: 110,
      y: 100,
      velocityX: -2,
      velocityY: 3,
      radius: 10,
      hp: 10,
      maxHp: 10
    }
  ],
  friendlyProjectiles: [],
  hostileProjectiles: [],
  homingMissiles: []
} satisfies DisplayGameSnapshot;
