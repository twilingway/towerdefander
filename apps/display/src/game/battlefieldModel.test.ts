import type { PublicGameSnapshot } from "@town-defenders/protocol";
import { describe, expect, it } from "vitest";

import { BattlefieldSnapshotFeed } from "./battlefieldModel.js";

function snapshot(sequence: number): PublicGameSnapshot {
  return {
    tick: sequence,
    elapsedMs: sequence * 1000,
    treasury: 50,
    pathLength: 12,
    repairCost: 15,
    result: "in_progress",
    waveNumber: 2,
    totalWaves: 5,
    stage: "combat",
    intermissionRemainingSeconds: 0,
    airstrikeCharge: 0,
    airstrikeChargeRequired: 100,
    airstrikeDamage: 30,
    lastAirstrikeEffect:
      sequence === 0
        ? null
        : {
            sequence,
            actionId: `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
            playerId: "player-1",
            targetSectorId: 1,
            appliedTick: sequence
          },
    sectors: [
      {
        sectorId: 0,
        assignedPlayerId: "player-1",
        gateHealth: 100,
        gateMaxHealth: 100,
        defenseLevel: 1,
        defenseDamage: 4,
        nextUpgradeCost: 20,
        enemyCount: 0,
        airstrikeTargetAvailable: false
      },
      {
        sectorId: 1,
        assignedPlayerId: "player-2",
        gateHealth: 100,
        gateMaxHealth: 100,
        defenseLevel: 1,
        defenseDamage: 4,
        nextUpgradeCost: 20,
        enemyCount: 0,
        airstrikeTargetAvailable: false
      }
    ],
    enemies: []
  };
}

describe("BattlefieldSnapshotFeed", () => {
  it("hydrates an existing effect without replaying it", () => {
    const feed = new BattlefieldSnapshotFeed();

    expect(feed.next(snapshot(4)).airstrikeEffect).toBeNull();
    expect(feed.next(snapshot(4)).airstrikeEffect).toBeNull();
    expect(feed.next(snapshot(5)).airstrikeEffect?.sequence).toBe(5);
    expect(feed.next(snapshot(5)).airstrikeEffect).toBeNull();
  });

  it("uses the first snapshot after a transport drop as a new baseline", () => {
    const feed = new BattlefieldSnapshotFeed();

    feed.next(snapshot(4));
    expect(feed.next(snapshot(5)).airstrikeEffect?.sequence).toBe(5);
    feed.prepareHydration();
    expect(feed.next(snapshot(6)).airstrikeEffect).toBeNull();
    expect(feed.next(snapshot(7)).airstrikeEffect?.sequence).toBe(7);
  });
});
