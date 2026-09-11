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
import { type ArenaZone } from "./arenaZones.ts";
import { arenaCentre, arenaSpawnMarks } from "./arenaMatch.ts";
import { advanceArenaZones, createArenaZones, zoneAt } from "./arenaZones.ts";

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

function zone(zones: readonly ArenaZone[], index: number): ArenaZone {
  const found = zones[index];
  if (found === undefined) throw new Error(`no zone at index ${String(index)}`);
  return found;
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

    const centre = arenaCentre(defaultArenaMatchConfig);
    expect(state.ships).toHaveLength(ARENA_SHIP_COUNT);
    for (const ship of state.ships) {
      const distance = Math.hypot(ship.spaceship.x - centre.x, ship.spaceship.y - centre.y);
      expect(distance).toBeLessThanOrEqual(defaultArenaMatchConfig.spawnRadius + 1e-6);
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
    // Ten seeds used to produce ten identical matches, because sixteen equal
    // hulls on an even ring is a symmetric problem with a symmetric answer.
    const other = createArenaMatch(defaultArenaMatchConfig, 99, botSeats);

    expect(other.ships.map((ship) => ship.spaceship.x)).not.toEqual(
      match().ships.map((ship) => ship.spaceship.x)
    );
  });

  it("hands out the same sixteen marks whatever the seed", () => {
    // The field's shape belongs to the arena; only who stands where is the
    // seed's business.
    const centre = arenaCentre(defaultArenaMatchConfig);
    const marks = arenaSpawnMarks(ARENA_SHIP_COUNT, defaultArenaMatchConfig.spawnRadius).map(
      (mark) => ({ x: mark.x + centre.x, y: mark.y + centre.y })
    );
    const key = (point: { x: number; y: number }) => `${point.x.toFixed(3)}:${point.y.toFixed(3)}`;
    const expected = new Set(marks.map(key));

    for (const seed of [11, 4242, 99]) {
      const taken = createArenaMatch(defaultArenaMatchConfig, seed, botSeats).ships.map((ship) =>
        key({ x: ship.spaceship.x, y: ship.spaceship.y })
      );
      expect(new Set(taken)).toEqual(expected);
      expect(taken.length).toBe(new Set(taken).size);
    }
  });

  it("keeps the marks evenly apart", () => {
    // Distances do not care where the centre is, so these are the raw marks.
    const marks = arenaSpawnMarks(ARENA_SHIP_COUNT, defaultArenaMatchConfig.spawnRadius);
    const nearest = marks.map((mark, index) =>
      Math.min(
        ...marks
          .filter((_other, other) => other !== index)
          .map((other) => Math.hypot(other.x - mark.x, other.y - mark.y))
      )
    );
    const smallest = Math.min(...nearest);
    const largest = Math.max(...nearest);

    // Even, not identical: a disc cannot be tiled by sixteen equal distances,
    // and the spiral's spread is what "as even as a circle allows" means.
    expect(smallest).toBeGreaterThan(defaultArenaMatchConfig.ship.spaceshipRadius * 8);
    expect(largest / smallest).toBeLessThan(1.6);
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

    const wallCentre = arenaCentre(defaultArenaMatchConfig);
    for (const ship of state.ships) {
      const distance = Math.hypot(ship.spaceship.x - wallCentre.x, ship.spaceship.y - wallCentre.y);
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

describe("the sheet of zones", () => {
  it("covers the disc and nothing else", () => {
    const zones = createArenaZones(defaultArenaMatchConfig);
    const radius = defaultArenaMatchConfig.arenaRadius;
    const centre = arenaCentre(defaultArenaMatchConfig);

    // Ten by ten over the square, minus the corner rectangles the disc never
    // reaches - which is what the reach test above is for.
    expect(zones.length).toBeGreaterThan(60);
    expect(zones.length).toBeLessThan(100);
    for (const zone of zones) {
      const nearestX = Math.max(zone.x - centre.x, Math.min(0, zone.x - centre.x + zone.width));
      const nearestY = Math.max(zone.y - centre.y, Math.min(0, zone.y - centre.y + zone.height));
      expect(Math.hypot(nearestX, nearestY)).toBeLessThan(radius);
      expect(zone.state).toBe("safe");
    }
  });

  it("closes the zone holding the most hulls", () => {
    const zones = createArenaZones(defaultArenaMatchConfig);
    const middle = arenaCentre(defaultArenaMatchConfig);
    const fromCentre = (candidate: ArenaZone) =>
      Math.hypot(
        candidate.x + candidate.width / 2 - middle.x,
        candidate.y + candidate.height / 2 - middle.y
      );
    // The outermost layer closes first, so the crowd has to stand in it for the
    // crowd rule to be the one under test.
    const crowded = zone(
      [...zones].sort((first, second) => fromCentre(second) - fromCentre(first)),
      0
    );
    const inside = {
      x: crowded.x + crowded.width / 2,
      y: crowded.y + crowded.height / 2
    };
    const state = match();
    const gathered = state.ships.map((ship, index) =>
      index < 6
        ? {
            ...ship,
            spaceship: {
              ...ship.spaceship,
              x: inside.x,
              y: inside.y,
              previousX: inside.x,
              previousY: inside.y
            }
          }
        : ship
    );

    // One tick left on the clock, so this step is the one that picks.
    const stepped = advanceArenaZones(zones, gathered, 1, defaultArenaMatchConfig);
    const warned = stepped.zones.filter((candidate) => candidate.state === "warning");

    expect(warned.map((candidate) => candidate.id)).toEqual([crowded.id]);
  });

  it("warns before it kills", () => {
    const config: ArenaMatchConfig = {
      ...defaultArenaMatchConfig,
      zoneWarningTicks: 3,
      zoneIntervalTicks: 1
    };
    let zones = createArenaZones(config);
    const ships = match().ships;

    zones = advanceArenaZones(zones, ships, 1, config).zones;
    expect(zones.filter((zone) => zone.state === "warning")).toHaveLength(1);

    for (let tick = 0; tick < 3; tick += 1) {
      zones = advanceArenaZones(zones, ships, 10, config).zones;
    }
    expect(zones.filter((zone) => zone.state === "closed")).toHaveLength(1);
  });

  it("keeps turning zones amber on its own beat, whatever the old ones are doing", () => {
    /*
     * The complaint this answers: "no new amber until the last one is red".
     * The sheet's beat is the interval and nothing else - a zone going amber
     * does not hold the next pick - so an amber that lasts longer than the
     * interval simply means several are amber at once. With the two set equal,
     * which is where the arena started, exactly one is amber at any moment and
     * the next appears on the same tick the old one reddens, which is what
     * reads as waiting.
     */
    const config: ArenaMatchConfig = {
      ...defaultArenaMatchConfig,
      zoneIntervalTicks: 2,
      zoneWarningTicks: 9
    };
    let zones = createArenaZones(config);
    let countdown = config.zoneIntervalTicks;
    const ships = match().ships;

    for (let tick = 0; tick < 8; tick += 1) {
      const stepped = advanceArenaZones(zones, ships, countdown, config);
      zones = stepped.zones;
      countdown = stepped.ticksUntilNextClosure;
    }

    // Four beats of two ticks, none of them red yet: the amber lasts nine.
    expect(zones.filter((candidate) => candidate.state === "warning")).toHaveLength(4);
    expect(zones.filter((candidate) => candidate.state === "closed")).toHaveLength(0);
  });

  it("never takes the last safe zone", () => {
    const config: ArenaMatchConfig = {
      ...defaultArenaMatchConfig,
      zoneWarningTicks: 1,
      zoneIntervalTicks: 1
    };
    let zones = createArenaZones(config);
    const ships = match().ships;
    for (let tick = 0; tick < 200; tick += 1) {
      zones = advanceArenaZones(zones, ships, 1, config).zones;
    }

    expect(zones.filter((zone) => zone.state === "safe")).toHaveLength(1);
  });

  it("closes only from the edges and from what is already closed", () => {
    const config: ArenaMatchConfig = {
      ...defaultArenaMatchConfig,
      zoneWarningTicks: 1,
      zoneIntervalTicks: 1
    };
    let zones = createArenaZones(config);
    const ships = match().ships;

    // Walk the sheet down to its last safe zone and check the shape at every
    // step: safe ground never develops a hole, because a hole is ground a hull
    // cannot cross and the squeeze stops meaning anything.
    for (let tick = 0; tick < 400; tick += 1) {
      zones = advanceArenaZones(zones, ships, 1, config).zones;
      const safe = zones.filter((zone) => zone.state === "safe");
      // Whatever is still safe sits inside what is still safe: the closure is
      // always taken from the frontier, so the field cannot develop a hole in
      // the middle of open ground.
      for (const zone of safe) {
        const interior =
          zone.column > 0 &&
          zone.row > 0 &&
          zone.column < config.zoneColumns - 1 &&
          zone.row < config.zoneRows - 1;
        if (!interior) continue;
        const neighbours = zones.filter(
          (other) => Math.abs(other.column - zone.column) + Math.abs(other.row - zone.row) === 1
        );
        expect(neighbours.length).toBeGreaterThan(0);
      }
    }

    const survivor = zone(
      zones.filter((candidate) => candidate.state === "safe"),
      0
    );
    const middle = arenaCentre(config);
    const offset = Math.hypot(
      survivor.x + survivor.width / 2 - middle.x,
      survivor.y + survivor.height / 2 - middle.y
    );
    // And what is left is the middle, which is where the fight is meant to end.
    expect(offset).toBeLessThan(config.arenaRadius / 2);
  });

  it("bites a hull standing in a closed zone, shield or no shield", () => {
    const config: ArenaMatchConfig = {
      ...defaultArenaMatchConfig,
      shipCount: 2,
      zoneWarningTicks: 1,
      zoneIntervalTicks: 1,
      // The beat lands on the very next step, so the test measures one bite.
      zoneDamageIntervalTicks: 1
    };
    const start = createArenaMatch(config, 7, [
      { control: "bot", botLevel: "veteran" },
      { control: "bot", botLevel: "veteran" }
    ]);
    // A zone whose centre the arena actually contains: a corner rectangle
    // touches the disc only at its inner edge, and a hull parked in its middle
    // would be shoved back inside the wall before the zone could burn it.
    const middle = arenaCentre(config);
    const doomedZone =
      [...start.zones].sort(
        (first, second) =>
          Math.hypot(first.x + first.width / 2 - middle.x, first.y + first.height / 2 - middle.y) -
          Math.hypot(
            second.x + second.width / 2 - middle.x,
            second.y + second.height / 2 - middle.y
          )
      )[0] ?? zone([], 0);
    const inside = {
      x: doomedZone.x + doomedZone.width / 2,
      y: doomedZone.y + doomedZone.height / 2
    };
    const parked: ArenaMatchState = {
      ...start,
      ticksUntilNextClosure: 1,
      ticksUntilZoneDamage: 1,
      zones: start.zones.map((zone) =>
        zone.id === doomedZone.id ? { ...zone, state: "closed" as const } : zone
      ),
      ships: start.ships.map((ship, index) => ({
        ...ship,
        shieldActive: index === 0,
        shieldPhase: index === 0 ? ("up" as const) : ship.shieldPhase,
        spaceship: {
          ...ship.spaceship,
          x: inside.x,
          y: inside.y,
          previousX: inside.x,
          previousY: inside.y
        }
      }))
    };

    const after = advanceArenaMatch(parked, new Map(), config);

    for (const ship of after.ships) {
      // A sixth of the maximum, on the beat: six of these kill a hull that
      // drove in whole, and a repair between beats buys another one.
      expect(ship.maxHp - ship.hp).toBeCloseTo(ship.maxHp / 6, 6);
    }
    expect(zoneAt(after.zones, inside.x, inside.y)?.state).toBe("closed");
  });

  it("kills a parked hull in six bites and not five", () => {
    const config: ArenaMatchConfig = {
      ...defaultArenaMatchConfig,
      shipCount: 2,
      zoneWarningTicks: 1,
      zoneIntervalTicks: 10_000,
      zoneDamageIntervalTicks: 1
    };
    const start = createArenaMatch(config, 9, [
      { control: "bot", botLevel: "veteran" },
      { control: "bot", botLevel: "veteran" }
    ]);
    const middle = arenaCentre(config);
    const doomedZone =
      [...start.zones].sort(
        (first, second) =>
          Math.hypot(first.x + first.width / 2 - middle.x, first.y + first.height / 2 - middle.y) -
          Math.hypot(
            second.x + second.width / 2 - middle.x,
            second.y + second.height / 2 - middle.y
          )
      )[0] ?? zone([], 0);
    const inside = {
      x: doomedZone.x + doomedZone.width / 2,
      y: doomedZone.y + doomedZone.height / 2
    };
    let state: ArenaMatchState = {
      ...start,
      ticksUntilZoneDamage: 1,
      zones: start.zones.map((zone) =>
        zone.id === doomedZone.id ? { ...zone, state: "closed" as const } : zone
      ),
      ships: start.ships.map((ship) => ({
        ...ship,
        spaceship: {
          ...ship.spaceship,
          x: inside.x,
          y: inside.y,
          previousX: inside.x,
          previousY: inside.y
        }
      }))
    };

    for (let bite = 0; bite < 5; bite += 1) {
      state = advanceArenaMatch(state, new Map(), config);
      if (state.phase === "result") break;
    }
    expect(state.ships.every((ship) => ship.alive)).toBe(true);

    state = advanceArenaMatch(state, new Map(), config);
    expect(state.ships.every((ship) => !ship.alive)).toBe(true);
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
