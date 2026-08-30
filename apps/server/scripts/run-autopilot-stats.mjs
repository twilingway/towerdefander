/**
 * Headless balance harness: the real simulation driven by the real autopilot
 * policy, with no browser, no network and no wall clock anywhere in the loop.
 *
 * The visible demo answers "does this look right". This answers "how far does a
 * crew of this skill actually get", which needs hundreds of runs rather than
 * one, and needs them reproducible. Everything here is a pure function of the
 * seed, so a run replays bit for bit.
 *
 * Usage:
 *   node apps/server/scripts/run-autopilot-stats.mjs [--runs 20] [--level ace]
 *                                        [--seed 1] [--intermission 1]
 *                                        [--max-waves 40] [--start-wave 5]
 *                                        [--preset path.json]
 */
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import {
  advanceSpaceshipSimulation,
  applyGunnerInput,
  applyPilotInput,
  applyShieldInput,
  createSpaceshipSimulationConfig,
  createSpaceshipSimulationState,
  voteForTeamUpgrade
} from "@spaceship-defender/game-core";
import { CAMERA_VIEW_ASPECT } from "@spaceship-defender/protocol";

import {
  createAutopilotMemory,
  planGunner,
  planPilot,
  planShield
} from "../../controller/scripts/visible-demo-policy.mjs";

const TICK_MS = 50;
/** A run that never dies still has to end; this is the give-up line. */
const DEFAULT_MAX_WAVES = 40;
/** Ticks a single run may burn before it counts as stuck, whatever the wave. */
const MAX_RUN_TICKS = 400_000;

const { values } = parseArgs({
  options: {
    runs: { type: "string", default: "20" },
    level: { type: "string", default: "ace" },
    seed: { type: "string", default: "1" },
    intermission: { type: "string" },
    "max-waves": { type: "string" },
    "start-wave": { type: "string" },
    preset: { type: "string" },
    json: { type: "boolean", default: false }
  }
});

function positiveInteger(raw, name) {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer, got ${String(raw)}`);
  }
  return value;
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
function buildWorld(state, config, sampledAtMs) {
  const ship = { x: state.spaceship.x, y: state.spaceship.y };
  const framed = (entities) =>
    entities.filter((entity) => insideFrame(ship, config.cameraViewWidth, entity));

  return {
    sampledAtMs,
    tick: state.clock.tick,
    phase: state.encounterPhase,
    waveNumber: state.waveNumber,
    cameraViewWidth: config.cameraViewWidth,
    arenaRadius: config.arenaRadius,
    worldWidth: config.worldWidth,
    worldHeight: config.worldHeight,
    shieldRadius: config.shieldRadius,
    turretAngle: state.turretAngle,
    ship: {
      x: state.spaceship.x,
      y: state.spaceship.y,
      heading: state.spaceshipHeading,
      velocityX: state.spaceship.velocity.x,
      velocityY: state.spaceship.velocity.y,
      radius: config.spaceshipRadius,
      hp: state.spaceshipHp,
      maxHp: state.spaceshipMaxHp
    },
    shield: {
      angle: state.shieldAngle,
      active: state.shieldActive,
      energy: state.shieldEnergy,
      capacity: config.shieldCapacity,
      arcHalfAngle: config.shieldArcRadians / 2
    },
    cannon: {
      heat: state.cannonHeat,
      capacity: config.cannonHeatCapacity,
      overheated: state.cannonOverheated
    },
    machineGun: {
      heat: state.mgHeat,
      capacity: config.mgHeatCapacity,
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
    }))
  };
}

/**
 * Buy whatever is on offer. Which card is chosen matters far less than that
 * credits get spent at all: a run that banks them measures a ship nobody would
 * ever actually fly.
 */
function castUpgradeVotes(state) {
  const offer = state.teamUpgradeOffer;
  const card = offer?.cards[0];
  if (offer === undefined || card === undefined) return state;

  let current = state;
  for (const role of ["pilot", "gunner", "shield"]) {
    if (current.teamUpgradeVotes[role]?.upgradeId === card.upgradeId) continue;
    const result = voteForTeamUpgrade(current, {
      role,
      waveNumber: current.waveNumber,
      offerId: offer.offerId,
      upgradeId: card.upgradeId,
      revision: 0
    });
    if (result.status === "accepted") current = result.state;
  }
  return current;
}

function playRun(config, seed, level, profile, maxWaves, startWave) {
  const memory = createAutopilotMemory(seed);
  const options = {
    archetypes: config.enemyArchetypes,
    cannonSpeed: config.projectileSpeedPerSecond,
    mgSpeed: config.mgProjectileSpeedPerSecond,
    turretRate: config.turretMaxAngularSpeedPerSecond
  };

  // A late start is a clean run on that wave: no credits, no upgrades, so the
  // crew is weaker than one that fought its way there.
  let state = createSpaceshipSimulationState(config, seed, startWave);
  let peakWave = state.waveNumber;

  while (state.outcome === null && state.clock.tick < MAX_RUN_TICKS) {
    if (state.waveNumber > maxWaves) break;
    // Simulation time, never wall clock: that is what makes a run replayable.
    const nowMs = state.clock.tick * TICK_MS;
    const world = buildWorld(state, config, nowMs);

    const pilot = planPilot(world, profile, memory, { ...options, nowMs });
    const gunner = planGunner(world, profile, memory, { ...options, nowMs });
    const shield = planShield(world, profile, memory);

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
    state = applyShieldInput(state, {
      vector: shield.aim,
      active: shield.active,
      receivedTick: state.clock.tick
    });

    if (state.encounterPhase === "intermission") state = castUpgradeVotes(state);
    state = advanceSpaceshipSimulation(state, config);
    peakWave = Math.max(peakWave, state.waveNumber);
  }

  return {
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
}

function percentile(sorted, share) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * share));
  return sorted[index];
}

function summarise(values) {
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

async function readTuning(presetPath) {
  if (presetPath === undefined) return undefined;
  const document = JSON.parse(await readFile(presetPath, "utf8"));
  const active = document.presets?.find(({ id }) => id === document.activePresetId);
  const tuning = active?.tuning ?? document.presets?.[0]?.tuning;
  if (tuning === undefined) throw new Error(`No preset with a tuning in ${presetPath}`);
  const enemyArchetypes = backfillArchetypes(tuning.enemyArchetypes);
  return enemyArchetypes === undefined ? tuning : { ...tuning, enemyArchetypes };
}

async function main() {
  const runs = positiveInteger(values.runs, "--runs");
  const firstSeed = positiveInteger(values.seed, "--seed");
  const maxWaves =
    values["max-waves"] === undefined
      ? DEFAULT_MAX_WAVES
      : positiveInteger(values["max-waves"], "--max-waves");
  const startWave =
    values["start-wave"] === undefined ? 1 : positiveInteger(values["start-wave"], "--start-wave");

  const tuning = await readTuning(values.preset);
  const overrides = { ...tuning };
  if (values.intermission !== undefined) {
    overrides.intermissionTicks = Math.max(
      1,
      Math.round(Number(values.intermission) * (1000 / TICK_MS))
    );
  }
  // `autopilot` is a demo section the simulation config does not carry.
  const autopilot = overrides.autopilot;
  delete overrides.autopilot;
  const config = createSpaceshipSimulationConfig(overrides);

  const profile = autopilot?.profiles?.[values.level];
  if (profile === undefined) {
    throw new Error(
      `No autopilot profile "${values.level}". Pass --preset with an autopilot section, ` +
        `or use one of its levels.`
    );
  }

  const results = [];
  for (let index = 0; index < runs; index += 1) {
    results.push(playRun(config, firstSeed + index, values.level, profile, maxWaves, startWave));
  }

  const report = {
    harness: "spaceship-defender-autopilot-stats",
    level: values.level,
    startWave,
    runs,
    intermissionSeconds: Number(((config.intermissionTicks * TICK_MS) / 1000).toFixed(2)),
    wave: summarise(results.map(({ wave }) => wave)),
    score: summarise(results.map(({ score }) => score)),
    seconds: summarise(results.map(({ seconds }) => seconds)),
    results
  };

  if (values.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(
    `${report.harness}: ${String(runs)} runs at "${values.level}", ` +
      `intermission ${String(report.intermissionSeconds)}s`
  );
  console.log(
    `  wave   min ${String(report.wave.min)}  median ${String(report.wave.median)}  ` +
      `mean ${String(report.wave.mean)}  max ${String(report.wave.max)}`
  );
  console.log(
    `  score  min ${String(report.score.min)}  median ${String(report.score.median)}  ` +
      `mean ${String(report.score.mean)}  max ${String(report.score.max)}`
  );
  console.log(
    `  length median ${String(report.seconds.median)}s  max ${String(report.seconds.max)}s`
  );
}

await main();
