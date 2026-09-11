// Sixteen hulls, no browser, no room: does the arena actually resolve?
//
// The headless twin of a match. It runs the real simulation under the real
// autopilot policy, so what it reports is what a player would sit in front of -
// and, because everything in it is seeded, the same seed replays the same
// match. That is what makes it a measurement rather than an anecdote: the ring
// schedule and the ship numbers are tuned against runs of this, not against a
// feeling about one match watched over someone's shoulder.
//
// Usage:
//   pnpm arena:match [--seed 4242] [--matches 1] [--level ace]

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  advanceArenaMatch,
  createArenaMatch,
  defaultArenaMatchConfig
} from "@spaceship-defender/game-core";

import { ArenaBots } from "../src/rooms/arenaBots.ts";
import { resolveAutopilotProfile } from "../src/rooms/crewPolicy.mjs";

const here = dirname(fileURLToPath(import.meta.url));

function parseArguments(argv) {
  const options = { seed: 4242, matches: 1, level: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === "--seed") options.seed = Number(value);
    else if (flag === "--matches") options.matches = Number(value);
    else if (flag === "--level") options.level = value;
    else continue;
    index += 1;
  }
  if (!Number.isFinite(options.seed) || options.seed <= 0)
    throw new Error("--seed must be positive");
  if (!Number.isInteger(options.matches) || options.matches < 1) {
    throw new Error("--matches must be a positive integer");
  }
  return options;
}

/** The operator's own autopilot numbers, the ones the console edits. */
function activeAutopilot() {
  const path = resolve(here, "../data/balance.json");
  const file = JSON.parse(readFileSync(path, "utf8"));
  const preset = file.presets.find((entry) => entry.id === file.activePresetId) ?? file.presets[0];
  if (preset === undefined) throw new Error(`No preset in ${path}`);
  return preset.tuning.autopilot;
}

function runMatch(config, seed, profile) {
  const seats = Array.from({ length: config.shipCount }, () => ({
    control: "bot",
    botLevel: null
  }));
  const bots = new ArenaBots(config, profile);
  let state = createArenaMatch(config, seed, seats);

  while (state.phase !== "result") {
    state = advanceArenaMatch(state, bots.intentsFor(state, config), config);
  }

  const survivors = state.ships.filter((ship) => ship.alive);
  const byRing = state.ships.filter((ship) => !ship.alive && ship.eliminatedBy === null).length;
  return {
    ticks: state.clock.tick,
    outcome: state.outcome,
    winner: state.winnerShipId,
    survivors: survivors.length,
    byRing,
    shots: state.nextProjectileSequence - 1,
    hp: survivors.map((ship) => Math.round(ship.hp))
  };
}

const options = parseArguments(process.argv.slice(2));
const autopilot = activeAutopilot();
const level = options.level ?? autopilot.level;
const profile = resolveAutopilotProfile(
  autopilot,
  level,
  defaultArenaMatchConfig.ship.cannonWeaponKind
);
if (profile === undefined) {
  throw new Error(`The preset carries no autopilot profile for ${level} on a kinetic turret.`);
}

console.log(
  `Arena: ${String(defaultArenaMatchConfig.shipCount)} hulls, level ${level}, ` +
    `${String(options.matches)} match(es), seed ${String(options.seed)}`
);

const started = Date.now();
for (let index = 0; index < options.matches; index += 1) {
  const seed = options.seed + index;
  const result = runMatch(defaultArenaMatchConfig, seed, profile);
  const seconds = (result.ticks * defaultArenaMatchConfig.ship.fixedStepMs) / 1000;
  console.log(
    `seed ${String(seed)}: ${result.outcome} after ${seconds.toFixed(1)} s ` +
      `(${String(result.ticks)} ticks), winner ${result.winner ?? "none"}, ` +
      `killed by ring ${String(result.byRing)}, shots ${String(result.shots)}` +
      (result.hp.length > 0 ? `, hp left ${result.hp.join("/")}` : "")
  );
}
console.log(`Wall clock: ${((Date.now() - started) / 1000).toFixed(1)} s`);
