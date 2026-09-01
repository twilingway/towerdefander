/**
 * Watches a run from outside the simulation.
 *
 * Everything here is recovered by comparing two neighbouring states, which is
 * the whole reason it lives outside `game-core`: an enemy only ever leaves the
 * arena by dying, a wave only ends by the combat-to-intermission edge, and a
 * phase change is visible in the state itself. What cannot be recovered that
 * way — damage dealt, hits, blocks, credit turnover — is counted inside the
 * step as `runStats`, and this file only slices those totals per wave.
 */

const TICK_MS = 50;

/** Counters the core keeps for the whole run; a wave figure is their difference. */
const RUN_STAT_KEYS = [
  "shotsByCannon",
  "shotsByMachineGun",
  "hitsByCannon",
  "hitsByMachineGun",
  "damageDealtByCannon",
  "damageDealtByMachineGun",
  "damageTakenFromBullets",
  "damageTakenFromMissiles",
  "damageTakenFromAsteroids",
  "damageTakenFromBeams",
  "shieldBlocks",
  "shieldEnergySpentOnBlocks",
  "shieldOverdrawnHits",
  "creditsEarned",
  "creditsSpent",
  "asteroidsDestroyed"
];

function diffRunStats(before, after) {
  const delta = {};
  for (const key of RUN_STAT_KEYS) delta[key] = (after[key] ?? 0) - (before[key] ?? 0);
  return delta;
}

function countByKind(spawns) {
  const counts = {};
  for (const spawn of spawns) counts[spawn.kind] = (counts[spawn.kind] ?? 0) + 1;
  return counts;
}

function isBossKind(config, kind) {
  return config.enemyArchetypes[kind]?.spawnPolicy === "boss";
}

/**
 * A boss wave is one whose plan contains a boss, not one the director would
 * have chosen. An operator writing a boss into a scripted wave — which is how
 * the shipped preset puts one on wave five — never goes through the director
 * at all, so asking the director would mark that wave ordinary.
 */
function bossWaveFrom(config, composition) {
  return Object.keys(composition).some((kind) => isBossKind(config, kind));
}

export function createRunObserver(config) {
  const waves = [];
  const upgrades = [];
  let current;

  const openWave = (state) => {
    const composition = countByKind(state.pendingSpawns);
    current = {
      waveNumber: state.waveNumber,
      startTick: state.clock.tick,
      ticks: 0,
      cleared: false,
      composition,
      bossWave: bossWaveFrom(config, composition),
      killsByKind: {},
      bossKills: 0,
      hpStart: state.spaceshipHp,
      hpEnd: state.spaceshipHp,
      maxHpStart: state.ship.spaceshipMaxHp,
      creditsStart: state.credits,
      creditsEnd: state.credits,
      scoreStart: state.score,
      scoreEnd: state.score,
      shieldUpTicks: 0,
      shieldRearmEvents: 0,
      cannonOverheatEvents: 0,
      mgOverheatEvents: 0,
      /** Filled in later: the ballot for this wave resolves after it closes. */
      upgrade: null,
      statsStart: state.runStats,
      stats: diffRunStats(state.runStats, state.runStats)
    };
  };

  const closeWave = (state, cleared) => {
    if (current === undefined) return;
    current.cleared = cleared;
    current.ticks = state.clock.tick - current.startTick;
    current.seconds = Number(((current.ticks * TICK_MS) / 1000).toFixed(1));
    current.hpEnd = state.spaceshipHp;
    current.creditsEnd = state.credits;
    current.scoreEnd = state.score;
    current.stats = diffRunStats(current.statsStart, state.runStats);
    delete current.statsStart;
    delete current.startTick;
    waves.push(current);
    current = undefined;
  };

  return {
    /** Called once per tick with the state on either side of the step. */
    record(before, after) {
      if (current === undefined && before.encounterPhase === "combat") openWave(before);

      if (before.encounterPhase === "combat" && current !== undefined) {
        const survivors = new Set(after.enemies.map(({ id }) => id));
        for (const enemy of before.enemies) {
          if (survivors.has(enemy.id)) continue;
          current.killsByKind[enemy.kind] = (current.killsByKind[enemy.kind] ?? 0) + 1;
          if (isBossKind(config, enemy.kind)) current.bossKills += 1;
        }
        if (after.shieldPhase === "up") current.shieldUpTicks += 1;
        if (!before.shieldRearmRequired && after.shieldRearmRequired) {
          current.shieldRearmEvents += 1;
        }
        if (!before.cannonOverheated && after.cannonOverheated) current.cannonOverheatEvents += 1;
        if (!before.mgOverheated && after.mgOverheated) current.mgOverheatEvents += 1;
      }

      // The crew's ballot is resolved on the tick the intermission ends, so the
      // votes live on the state going in and the purchase on the one coming out.
      const selection = after.teamUpgradeSelection;
      if (selection !== null && before.teamUpgradeSelection === null) {
        const purchase = {
          waveNumber: selection.waveNumber,
          upgradeId: selection.upgradeId,
          role: selection.role,
          price: selection.price,
          votes: Object.fromEntries(
            Object.entries(before.teamUpgradeVotes)
              .filter(([, vote]) => vote !== null)
              .map(([role, vote]) => [role, vote.upgradeId])
          )
        };
        upgrades.push(purchase);
        // The purchase happens in the intermission, which falls between two
        // combat windows, so the spend has to be posted back to the wave that
        // earned it. Without this every per-wave `creditsSpent` reads zero and
        // the economy chart shows income against a flat line.
        const earner = waves.find(({ waveNumber }) => waveNumber === purchase.waveNumber);
        if (earner !== undefined) {
          earner.stats.creditsSpent += purchase.price;
          earner.upgrade = purchase;
        }
      }

      if (before.encounterPhase === "combat" && after.encounterPhase === "intermission") {
        closeWave(after, true);
      } else if (after.outcome !== null) {
        closeWave(after, false);
      }
    },

    finish(state) {
      // A run stopped by the wave ceiling or the tick ceiling still has a wave
      // open; it is neither cleared nor a death, and it must not be lost.
      closeWave(state, false);
      return { waves, upgrades };
    }
  };
}
