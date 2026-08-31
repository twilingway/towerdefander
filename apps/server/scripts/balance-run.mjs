/**
 * The measurement engine: one run of the real simulation under the real
 * autopilot policy, with no browser, no network and no wall clock anywhere in
 * the loop. Both the single-cell harness (`run-autopilot-stats.mjs`) and the
 * matrix driver (`run-balance-batch.mjs`) import from here, so the two can
 * never drift into measuring subtly different games.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import {
  advanceSpaceshipSimulation,
  applyGunnerInput,
  applyPilotInput,
  applyShieldInput,
  createSpaceshipSimulationConfig,
  createSpaceshipSimulationState
} from "@spaceship-defender/game-core";
import { CAMERA_VIEW_ASPECT } from "@spaceship-defender/protocol";

import {
  createAutopilotMemory,
  leadSpeedFor,
  planGunner,
  planPilot,
  planShield
} from "../../controller/scripts/visible-demo-policy.mjs";
import { planUpgradeVotes } from "../../controller/scripts/upgrade-vote-policy.mjs";
// Imported straight from the server source, which works only because that file
// has no runtime relative imports — see the comment in its own header.
import { nextShieldIntent } from "../src/rooms/shieldAutopilot.ts";
import { castUpgradeVotes } from "./upgrade-votes.mjs";
import { createRunObserver } from "./stats-observer.mjs";

export const TICK_MS = 50;
/** A run that never dies still has to end; this is the give-up line. */
export const DEFAULT_MAX_WAVES = 40;
/** Ticks a single run may burn before it counts as stuck, whatever the wave. */
export const MAX_RUN_TICKS = 400_000;
/** Seats in the order a room fills them; mirrors CREW_ROLES on the server. */
export const CREW_ROLES = ["pilot", "gunner", "shield"];

export function defaultPresetPath() {
  return fileURLToPath(new URL("../data/balance.json", import.meta.url));
}

/**
 * The camera frame is what the bot can see, and it is the single most important
 * number in the whole harness: the policy refuses to target anything outside it,
 * exactly as it does when reading the real display.
 */
function insideFrame(ship, cameraViewWidth, entity) {
  return (
    Math.abs(entity.x - ship.x) <= cameraViewWidth / 2 &&
    Math.abs(entity.y - ship.y) <= (cameraViewWidth * CAMERA_VIEW_ASPECT) / 2
  );
}

function toEntity(entity) {
  return {
    entityId: entity.id,
    spawnSequence: entity.spawnSequence,
    x: entity.x,
    y: entity.y,
    velocityX: entity.velocity.x,
    velocityY: entity.velocity.y,
    radius: entity.radius
  };
}

/**
 * The same picture `buildVisibleDemoWorld` hands the bot in the browser, built
 * straight from simulation state instead of from a rendered snapshot. Kept in
 * the same shape on purpose: the policy must not be able to tell the difference
 * between this harness and a real run.
 */
export function buildWorld(state, config, sampledAtMs) {
  const ship = { x: state.spaceship.x, y: state.spaceship.y };
  const framed = (entities) =>
    entities.filter((entity) => insideFrame(ship, config.cameraViewWidth, entity));

  return {
    sampledAtMs,
    tick: state.clock.tick,
    phase: state.encounterPhase,
    waveNumber: state.waveNumber,
    salvageWindowSeconds: Math.ceil((state.lootWindowTicksRemaining * TICK_MS) / 1000),
    cameraViewWidth: config.cameraViewWidth,
    arenaRadius: config.arenaRadius,
    worldWidth: config.worldWidth,
    worldHeight: config.worldHeight,
    shieldRadius: state.ship.shieldRadius,
    turretAngle: state.turretAngle,
    ship: {
      x: state.spaceship.x,
      y: state.spaceship.y,
      heading: state.spaceshipHeading,
      velocityX: state.spaceship.velocity.x,
      velocityY: state.spaceship.velocity.y,
      radius: state.ship.spaceshipRadius,
      hp: state.spaceshipHp,
      maxHp: state.ship.spaceshipMaxHp
    },
    shield: {
      angle: state.shieldAngle,
      active: state.shieldActive,
      energy: state.shieldEnergy,
      capacity: state.ship.shieldCapacity,
      arcHalfAngle: state.ship.shieldArcRadians / 2
    },
    cannon: {
      heat: state.cannonHeat,
      capacity: state.ship.cannonHeatCapacity,
      overheated: state.cannonOverheated
    },
    machineGun: {
      heat: state.mgHeat,
      capacity: state.ship.mgHeatCapacity,
      overheated: state.mgOverheated
    },
    enemies: framed(state.enemies).map((enemy) => ({
      ...toEntity(enemy),
      kind: enemy.kind,
      heading: enemy.heading,
      hp: enemy.hp,
      maxHp: enemy.maxHp
    })),
    missiles: framed(state.homingMissiles).map((missile) => ({
      ...toEntity(missile),
      heading: missile.heading
    })),
    bullets: framed(state.hostileProjectiles).map(toEntity),
    asteroids: framed(state.asteroids).map((rock) => ({
      ...toEntity(rock),
      origin: rock.origin,
      hp: rock.hp,
      maxHp: rock.maxHp
    })),
    loot: framed(state.lootDrops).map((drop) => ({
      ...toEntity(drop),
      kind: drop.kind,
      amount: drop.amount
    }))
  };
}

/**
 * One run. `crewSize` reproduces what a room of that size does: seats below
 * three do not vote, and a crew without a shield seat has the server autopilot
 * hold the sector — in combat only, and before the step, exactly as
 * `SpaceshipDefenderRoom.advanceGameStep` does it.
 */
export function playRun(config, options) {
  const {
    seed,
    level,
    profile,
    maxWaves = DEFAULT_MAX_WAVES,
    startWave = 1,
    crewSize = CREW_ROLES.length,
    detail = false
  } = options;
  const memory = createAutopilotMemory(seed);
  const policyOptions = {
    archetypes: config.enemyArchetypes,
    cannonSpeed: leadSpeedFor(config.cannonWeaponKind, config.projectileSpeedPerSecond),
    mgSpeed: leadSpeedFor(config.mgWeaponKind, config.mgProjectileSpeedPerSecond),
    turretRate: config.turretMaxAngularSpeedPerSecond
  };
  const seats = CREW_ROLES.slice(0, crewSize);
  const observer = detail ? createRunObserver(config) : undefined;

  // A late start is a clean run on that wave: no credits, no upgrades, so the
  // crew is weaker than one that fought its way there.
  let state = createSpaceshipSimulationState(config, seed, startWave);
  let peakWave = state.waveNumber;
  // How long the wave that just ended took, which is one of the signals the
  // upgrade policy weighs: a dragging wave asks for guns.
  let waveStartTick = state.clock.tick;
  let waveSeconds = 0;

  while (state.outcome === null && state.clock.tick < MAX_RUN_TICKS) {
    if (state.waveNumber > maxWaves) break;
    // Simulation time, never wall clock: that is what makes a run replayable.
    const nowMs = state.clock.tick * TICK_MS;
    const world = buildWorld(state, config, nowMs);

    const pilot = planPilot(world, profile, memory, { ...policyOptions, nowMs });
    const gunner = planGunner(world, profile, memory, { ...policyOptions, nowMs });

    state = applyPilotInput(state, {
      vector: pilot.vector,
      turn: pilot.turn,
      thrust: pilot.thrust,
      mgFiring: pilot.mgFiring,
      receivedTick: state.clock.tick
    });
    state = applyGunnerInput(state, {
      vector: gunner.aim,
      firing: gunner.firing,
      receivedTick: state.clock.tick
    });
    if (seats.includes("shield")) {
      const shield = planShield(world, profile, memory);
      state = applyShieldInput(state, {
        vector: shield.aim,
        active: shield.active,
        receivedTick: state.clock.tick
      });
    } else if (state.encounterPhase === "combat") {
      state = applyShieldInput(state, nextShieldIntent(state, config));
    }

    if (state.encounterPhase === "intermission") {
      state = castUpgradeVotes(state, {
        crewSize,
        level,
        waveSeconds
      });
    }

    const before = state;
    state = advanceSpaceshipSimulation(state, config);
    observer?.record(before, state);
    if (before.encounterPhase === "combat" && state.encounterPhase === "intermission") {
      waveSeconds = ((state.clock.tick - waveStartTick) * TICK_MS) / 1000;
    } else if (before.encounterPhase === "intermission" && state.encounterPhase === "combat") {
      waveStartTick = state.clock.tick;
    }
    peakWave = Math.max(peakWave, state.waveNumber);
  }

  const record = {
    seed,
    level,
    wave: peakWave,
    score: state.score,
    credits: state.credits,
    ticks: state.clock.tick,
    seconds: Number(((state.clock.tick * TICK_MS) / 1000).toFixed(1)),
    outcome: state.outcome ?? "unfinished",
    defeatReason: state.defeatReason ?? null
  };
  if (observer === undefined) return record;
  const observed = observer.finish(state);
  return { ...record, crewSize, stats: state.runStats, ...observed };
}

function percentile(sorted, share) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * share));
  return sorted[index];
}

export function summarise(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  return {
    min: sorted[0] ?? 0,
    median: percentile(sorted, 0.5),
    mean: Number((total / (sorted.length || 1)).toFixed(1)),
    p95: percentile(sorted, 0.95),
    max: sorted[sorted.length - 1] ?? 0
  };
}

/**
 * The operator's file is read raw here, without the server's migration, so an
 * archetype saved before a setting existed arrives short of it and the config
 * factory rejects the whole catalogue. Layer each saved archetype over the
 * built-in one of the same id — read-only, nothing is written back — so a
 * measurement never fails on a field the operator has simply never seen.
 */
function backfillArchetypes(saved) {
  if (saved === undefined) return undefined;
  const builtin = createSpaceshipSimulationConfig().enemyArchetypes;
  const fallback = builtin.gunship;
  return Object.fromEntries(
    Object.entries(saved).map(([kind, archetype]) => [
      kind,
      { ...(builtin[kind] ?? fallback), ...archetype }
    ])
  );
}

/** Every preset in the document, so the batch can sweep them by id. */
export async function readPresets(presetPath) {
  const raw = presetPath ?? defaultPresetPath();
  const document = JSON.parse(await readFile(raw, "utf8"));
  const presets = document.presets ?? [];
  if (presets.length === 0) throw new Error(`No presets in ${raw}`);
  return { activePresetId: document.activePresetId, presets };
}

export async function readTuning(presetPath, presetId) {
  const { activePresetId, presets } = await readPresets(presetPath);
  const wanted = presetId ?? activePresetId;
  const chosen = presets.find(({ id }) => id === wanted) ?? presets[0];
  const tuning = chosen?.tuning;
  if (tuning === undefined) {
    throw new Error(`No preset "${String(wanted)}" with a tuning in ${String(presetPath)}`);
  }
  const enemyArchetypes = backfillArchetypes(tuning.enemyArchetypes);
  return {
    presetId: chosen.id,
    presetName: chosen.name ?? chosen.id,
    tuning: enemyArchetypes === undefined ? tuning : { ...tuning, enemyArchetypes }
  };
}

/**
 * Builds the simulation config from a preset's tuning. The enemy difficulty
 * offset is merged **into** `enemySkill` rather than over it: the config
 * factory merges shallowly, so replacing the object would drop every profile
 * and fail validation.
 */
export function buildConfig(tuning, options = {}) {
  const overrides = { ...tuning };
  if (options.intermissionSeconds !== undefined) {
    overrides.intermissionTicks = Math.max(
      1,
      Math.round(Number(options.intermissionSeconds) * (1000 / TICK_MS))
    );
  }
  if (options.enemyOffset !== undefined && options.enemyOffset !== null) {
    overrides.enemySkill = { ...overrides.enemySkill, offset: options.enemyOffset };
  }
  // `autopilot` and `helm` are console sections the simulation config does not carry.
  const autopilot = overrides.autopilot;
  delete overrides.autopilot;
  delete overrides.helm;
  return { config: createSpaceshipSimulationConfig(overrides), autopilot };
}

export function profileFor(autopilot, level) {
  const profile = autopilot?.profiles?.[level];
  if (profile === undefined) {
    throw new Error(
      `No autopilot profile "${level}". Pass --preset with an autopilot section, ` +
        `or use one of its levels.`
    );
  }
  return profile;
}
