import { describe, expect, it } from "vitest";

import {
  IDLE_ARENA_INTENT,
  advanceArenaMatch,
  createArenaMatch,
  type ArenaShipSeat
} from "./arenaMatch.ts";
import { resolveArenaHits } from "./arenaMatchCombat.ts";
import { ARENA_SHIP_COUNT, defaultArenaMatchConfig } from "./arenaMatchConfig.ts";
import {
  type ArenaMatchConfig,
  type ArenaMatchState,
  type ArenaProjectileState,
  type ArenaShipIntent,
  type ArenaShipState
} from "./arenaMatchTypes.ts";
import { ringDamageForStep, ringPositionAt } from "./arenaRing.ts";

const botSeats: readonly ArenaShipSeat[] = Array.from({ length: ARENA_SHIP_COUNT }, () => ({
  control: "bot" as const,
  botLevel: "veteran"
}));

function match(config: ArenaMatchConfig = defaultArenaMatchConfig): ArenaMatchState {
  return createArenaMatch(config, 4242, botSeats);
}

function step(
  state: ArenaMatchState,
  intents: ReadonlyMap<string, ArenaShipIntent>
): ArenaMatchState {
  return advanceArenaMatch(state, intents, defaultArenaMatchConfig);
}

function shipAt(state: ArenaMatchState, slot: number): ArenaShipState {
  const ship = state.ships[slot];
  if (ship === undefined) throw new Error(`no ship in slot ${String(slot)}`);
  return ship;
}

function pick(ships: readonly ArenaShipState[], index: number): ArenaShipState {
  const ship = ships[index];
  if (ship === undefined) throw new Error(`no ship at index ${String(index)}`);
  return ship;
}

function shotAt(
  owner: string,
  from: { x: number; y: number },
  to: { x: number; y: number },
  damage: number
): ArenaProjectileState {
  return {
    id: `shot-${owner}`,
    projectileId: `shot-${owner}`,
    spawnSequence: 1,
    previousX: from.x,
    previousY: from.y,
    x: to.x,
    y: to.y,
    velocity: { x: to.x - from.x, y: to.y - from.y },
    radius: 6,
    damage,
    spawnedTick: 0,
    source: "cannon",
    homing: null,
    ownerShipId: owner
  };
}

describe("createArenaMatch", () => {
  it("scatters sixteen hulls over the whole arena, none on top of another", () => {
    const state = match();

    expect(state.ships).toHaveLength(ARENA_SHIP_COUNT);
    for (const ship of state.ships) {
      const distance = Math.hypot(ship.spaceship.x, ship.spaceship.y);
      expect(distance).toBeLessThanOrEqual(defaultArenaMatchConfig.spawnRadius);
    }

    for (const ship of state.ships) {
      for (const other of state.ships) {
        if (other.id === ship.id) continue;
        const gap = Math.hypot(
          other.spaceship.x - ship.spaceship.x,
          other.spaceship.y - ship.spaceship.y
        );
        expect(gap).toBeGreaterThan(defaultArenaMatchConfig.ship.spaceshipRadius * 2);
      }
    }
  });

  it("uses the whole disc rather than one ring", () => {
    // Even by area: the ring version put every hull at the same distance from
    // the centre, which is a starting line, not a free-for-all.
    const distances = match().ships.map((ship) => Math.hypot(ship.spaceship.x, ship.spaceship.y));
    const spread = Math.max(...distances) - Math.min(...distances);

    expect(spread).toBeGreaterThan(defaultArenaMatchConfig.spawnRadius * 0.4);
  });

  it("starts identically for the same seed", () => {
    const first = match();
    const second = match();

    expect(second.ships.map((ship) => [ship.id, ship.spaceship.x, ship.spaceship.y])).toEqual(
      first.ships.map((ship) => [ship.id, ship.spaceship.x, ship.spaceship.y])
    );
  });

  it("starts differently for a different seed", () => {
    // The whole point of the scatter: ten seeds used to produce ten identical
    // matches, because sixteen identical hulls on an even ring is a symmetric
    // problem with a symmetric answer.
    const other = createArenaMatch(defaultArenaMatchConfig, 99, botSeats);

    expect(other.ships.map((ship) => ship.spaceship.x)).not.toEqual(
      match().ships.map((ship) => ship.spaceship.x)
    );
  });

  it("keeps the typed caps adding up to the total", () => {
    const caps = defaultArenaMatchConfig.caps;

    expect(caps.ships + caps.projectiles + caps.homingMissiles).toBe(caps.dynamicEntities);
  });
});

describe("advanceArenaMatch", () => {
  it("replays tick for tick from the same seed and the same intents", () => {
    const intents = new Map<string, ArenaShipIntent>([
      ["ship-1", { ...IDLE_ARENA_INTENT, thrust: 1, turn: 0.4, firing: true }],
      ["ship-9", { ...IDLE_ARENA_INTENT, thrust: 1, turn: -0.2, mgFiring: true }]
    ]);

    let first = match();
    let second = match();
    for (let tick = 0; tick < 300; tick += 1) {
      first = step(first, intents);
      second = step(second, intents);
    }

    expect(JSON.stringify(second.ships)).toBe(JSON.stringify(first.ships));
    expect(JSON.stringify(second.projectiles)).toBe(JSON.stringify(first.projectiles));
  });

  it("holds every hull inside the arena wall", () => {
    const intents = new Map<string, ArenaShipIntent>(
      botSeats.map((_seat, slot) => [
        `ship-${String(slot + 1)}`,
        { ...IDLE_ARENA_INTENT, thrust: 1, turn: 0 }
      ])
    );

    let state = match();
    for (let tick = 0; tick < 600; tick += 1) state = step(state, intents);

    for (const ship of state.ships) {
      const distance = Math.hypot(ship.spaceship.x, ship.spaceship.y);
      expect(distance).toBeLessThanOrEqual(
        defaultArenaMatchConfig.arenaRadius - ship.stats.spaceshipRadius + 1e-6
      );
    }
  });
});

describe("resolveArenaHits", () => {
  it("does not let a hull shoot itself", () => {
    const state = match();
    const shooter = shipAt(state, 0);
    const shot = shotAt(
      shooter.id,
      { x: shooter.spaceship.x - 200, y: shooter.spaceship.y },
      { x: shooter.spaceship.x, y: shooter.spaceship.y },
      100
    );

    const resolved = resolveArenaHits(state.ships, [shot], defaultArenaMatchConfig);

    expect(resolved.ships[0]?.hp).toBe(shooter.hp);
    expect(resolved.projectiles).toHaveLength(1);
  });

  it("spends the shot on the shield when it comes through the arc", () => {
    const state = match();
    const target = shipAt(state, 0);
    const attacker = shipAt(state, 1);
    const bearing = Math.atan2(-target.spaceship.y, -target.spaceship.x) + Math.PI;
    const guarded: ArenaShipState = {
      ...target,
      shieldActive: true,
      shieldAngle: bearing,
      shieldPhase: "up"
    };
    const from = {
      x: target.spaceship.x + Math.cos(bearing) * 300,
      y: target.spaceship.y + Math.sin(bearing) * 300
    };
    const shot = shotAt(attacker.id, from, { x: target.spaceship.x, y: target.spaceship.y }, 50);

    const resolved = resolveArenaHits([guarded], [shot], defaultArenaMatchConfig);
    const after = pick(resolved.ships, 0);

    expect(after.hp).toBe(guarded.hp);
    expect(after.shieldEnergy).toBe(guarded.shieldEnergy - 50);
    expect(resolved.projectiles).toHaveLength(0);
  });

  it("takes the hull when the shot comes from behind the arc", () => {
    const state = match();
    const target = shipAt(state, 0);
    const bearing = Math.atan2(-target.spaceship.y, -target.spaceship.x) + Math.PI;
    const guarded: ArenaShipState = {
      ...target,
      shieldActive: true,
      shieldAngle: bearing + Math.PI,
      shieldPhase: "up"
    };
    const from = {
      x: target.spaceship.x + Math.cos(bearing) * 300,
      y: target.spaceship.y + Math.sin(bearing) * 300
    };
    const shot = shotAt("ship-2", from, { x: target.spaceship.x, y: target.spaceship.y }, 50);

    const resolved = resolveArenaHits([guarded], [shot], defaultArenaMatchConfig);
    const after = pick(resolved.ships, 0);

    expect(after.hp).toBe(guarded.hp - 50);
    expect(after.shieldEnergy).toBe(guarded.shieldEnergy);
  });
});

describe("the ring", () => {
  it("closes from phase to phase without jumping", () => {
    const phases = defaultArenaMatchConfig.ringPhases;
    const firstEnd = (phases[0]?.durationTicks ?? 0) - 1;
    const midSecond = firstEnd + Math.round((phases[1]?.durationTicks ?? 0) / 2);

    const atFirstEnd = ringPositionAt(firstEnd, defaultArenaMatchConfig);
    const atMidSecond = ringPositionAt(midSecond, defaultArenaMatchConfig);

    expect(atFirstEnd.radius).toBeCloseTo(phases[0]?.radius ?? 0, 0);
    expect(atMidSecond.radius).toBeLessThan(atFirstEnd.radius);
    expect(atMidSecond.radius).toBeGreaterThan(phases[1]?.radius ?? 0);
    expect(atMidSecond.nextRadius).toBe(phases[2]?.radius);
  });

  it("burns a hull outside the boundary and stops at the line", () => {
    const ring = ringPositionAt(5000, defaultArenaMatchConfig);

    expect(ringDamageForStep(ring.radius, ring, defaultArenaMatchConfig)).toBe(0);
    expect(ringDamageForStep(ring.radius + 200, ring, defaultArenaMatchConfig)).toBeGreaterThan(0);
  });

  it("goes through a raised shield, because the shield never sees it", () => {
    const config: ArenaMatchConfig = {
      ...defaultArenaMatchConfig,
      // One tick long, so the very first step already finds both hulls outside.
      ringPhases: [{ radius: 200, durationTicks: 1, damagePerSecond: 600 }],
      matchTickLimit: 10_000
    };
    const seats: readonly ArenaShipSeat[] = [
      { control: "bot", botLevel: "veteran" },
      { control: "bot", botLevel: "veteran" }
    ];
    const start = createArenaMatch({ ...config, shipCount: 2 }, 7, seats);
    const guarded: ArenaMatchState = {
      ...start,
      ships: start.ships.map((ship, index) =>
        index === 0 ? { ...ship, shieldActive: true, shieldPhase: "up" as const } : ship
      )
    };

    const after = advanceArenaMatch(guarded, new Map(), { ...config, shipCount: 2 });

    const withShield = pick(after.ships, 0);
    const without = pick(after.ships, 1);
    expect(withShield.hp).toBeLessThan(start.ships[0]?.hp ?? 0);
    expect(withShield.hp).toBeCloseTo(without.hp, 6);
  });
});

describe("the end of a match", () => {
  it("crowns the last hull standing", () => {
    const config: ArenaMatchConfig = { ...defaultArenaMatchConfig, shipCount: 2 };
    const seats: readonly ArenaShipSeat[] = [
      { control: "bot", botLevel: "veteran" },
      { control: "bot", botLevel: "veteran" }
    ];
    const start = createArenaMatch(config, 11, seats);
    const doomed: ArenaMatchState = {
      ...start,
      ships: start.ships.map((ship, index) =>
        index === 1 ? { ...ship, hp: 0, alive: false } : ship
      )
    };

    const after = advanceArenaMatch(doomed, new Map(), config);

    expect(after.phase).toBe("result");
    expect(after.outcome).toBe("lastStanding");
    expect(after.winnerShipId).toBe("ship-1");
  });

  it("hands the time limit to the healthiest hull", () => {
    const config: ArenaMatchConfig = {
      ...defaultArenaMatchConfig,
      shipCount: 2,
      matchTickLimit: 1
    };
    const seats: readonly ArenaShipSeat[] = [
      { control: "bot", botLevel: "veteran" },
      { control: "bot", botLevel: "veteran" }
    ];
    const start = createArenaMatch(config, 12, seats);
    const hurt: ArenaMatchState = {
      ...start,
      ships: start.ships.map((ship, index) => (index === 0 ? { ...ship, hp: ship.hp / 2 } : ship))
    };

    const after = advanceArenaMatch(hurt, new Map(), config);

    expect(after.phase).toBe("result");
    expect(after.outcome).toBe("timeLimit");
    expect(after.winnerShipId).toBe("ship-2");
  });

  it("calls it a draw when the time limit finds them even", () => {
    const config: ArenaMatchConfig = {
      ...defaultArenaMatchConfig,
      shipCount: 2,
      matchTickLimit: 1
    };
    const seats: readonly ArenaShipSeat[] = [
      { control: "bot", botLevel: "veteran" },
      { control: "bot", botLevel: "veteran" }
    ];

    const after = advanceArenaMatch(createArenaMatch(config, 13, seats), new Map(), config);

    expect(after.outcome).toBe("draw");
    expect(after.winnerShipId).toBeNull();
  });
});
