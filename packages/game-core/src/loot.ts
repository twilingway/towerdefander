import {
  type CombatConfig,
  type CombatEnemyState,
  type CombatStepState,
  type LootDropState,
  type LootKind
} from "./combatTypes.ts";
import { archetypeOf } from "./combatValidation.ts";
import { arenaFromConfig } from "./combatMath.ts";
import { isWithinCircularEnvelope } from "./arenaGeometry.ts";
import { nextUint32 } from "./rng.ts";
import { UINT32_MAX } from "./combatConstants.ts";

/**
 * Salvage: the only way a crew wins hull back inside a run.
 *
 * The whole lifecycle lives here except the roll itself, which has to happen
 * where an enemy dies. Pickup is one rule — outside the magnet radius a drop
 * drifts, inside it comes to the ship — deliberately with no "stand still and
 * take no damage" condition: that reads on screen as a bug rather than a miss,
 * and with three enemies shooting it is unachievable anyway.
 */

export interface LootRoll {
  readonly rngState: number;
  readonly drop: LootDropState | null;
}

/**
 * Rolls for salvage on a kill. A boss ignores the roll and always leaves a
 * repair, which is what makes clearing a boss wave a recovery point rather
 * than only a score.
 */
export function rollLootDrop(
  enemy: CombatEnemyState,
  config: CombatConfig,
  rngState: number,
  spawnSequence: number,
  tick: number
): LootRoll {
  const archetype = archetypeOf(config, enemy.kind);
  const boss = archetype.spawnPolicy === "boss";
  const [next, random] = nextUint32(rngState);
  if (!boss && random / (UINT32_MAX + 1) >= archetype.lootChance) {
    return { rngState: next, drop: null };
  }
  const kind: LootKind = boss || random % 2 === 0 ? "repair" : "shieldCell";
  const amount = boss
    ? config.lootBossRepairAmount
    : kind === "repair"
      ? config.lootRepairAmount
      : config.lootShieldAmount;
  return { rngState: next, drop: createLootDrop(enemy, config, kind, amount, spawnSequence, tick) };
}

function createLootDrop(
  enemy: CombatEnemyState,
  config: CombatConfig,
  kind: LootKind,
  amount: number,
  spawnSequence: number,
  tick: number
): LootDropState {
  return {
    id: `loot-${String(spawnSequence)}`,
    spawnSequence,
    previousX: enemy.x,
    previousY: enemy.y,
    x: enemy.x,
    y: enemy.y,
    // Inherited motion is what makes salvage read as wreckage rather than as a
    // spawned pickup; the damping below keeps it near where the fight was.
    velocity: { x: enemy.velocity.x, y: enemy.velocity.y },
    radius: config.lootDropRadius,
    spawnedTick: tick,
    kind,
    amount,
    lifetimeTicks: config.lootLifetimeTicks
  };
}

export interface LootWindow {
  readonly lootDrops: readonly LootDropState[];
  readonly lootWindowTicksRemaining: number;
}

/**
 * Holds a cleared wave open while salvage is still on the field, and returns
 * null the moment it is free to end.
 *
 * Without this the reward for the hardest kill of the run is unreachable: a
 * boss is the last enemy alive by construction, so killing it clears the wave
 * on the same tick, and the crew cannot fly during an intermission. The window
 * makes that reward something the pilot flies to rather than something the
 * scoreboard hands over.
 *
 * Every drop's clock restarts when the window opens. What the crew is promised
 * is the window, so salvage that fell early in the wave must not rot halfway
 * through it — and a drop nobody comes for still ends the wave by expiring.
 */
export function openOrTickLootWindow(
  before: Pick<CombatStepState, "enemies" | "lootWindowTicksRemaining">,
  after: Pick<CombatStepState, "lootDrops">,
  config: CombatConfig,
  tick: number
): LootWindow | null {
  if (after.lootDrops.length === 0) return null;
  if (before.lootWindowTicksRemaining > 0) {
    const remaining = before.lootWindowTicksRemaining - 1;
    return remaining > 0
      ? { lootDrops: after.lootDrops, lootWindowTicksRemaining: remaining }
      : null;
  }
  // The opening tick is the tick the field cleared, so a boss among the ships
  // that were alive when it started is a boss that has just died.
  const bossFell = before.enemies.some(
    (enemy) => archetypeOf(config, enemy.kind).spawnPolicy === "boss"
  );
  const ticks = bossFell ? config.lootBossWindowTicks : config.lootWindowTicks;
  return {
    lootDrops: after.lootDrops.map((drop) => ({
      ...drop,
      spawnedTick: tick,
      lifetimeTicks: ticks
    })),
    lootWindowTicksRemaining: ticks
  };
}

export interface LootStep {
  readonly lootDrops: readonly LootDropState[];
  readonly spaceshipHp: number;
  readonly shieldEnergy: number;
}

/**
 * One tick of every drop on the arena: drift with damping, magnet pull, pickup
 * on hull contact, and expiry by lifetime or by leaving the arena.
 */
export function advanceLootDrops(
  state: CombatStepState,
  config: CombatConfig,
  secondsPerStep: number,
  shieldCapacity: number
): LootStep {
  if (state.lootDrops.length === 0) {
    return {
      lootDrops: state.lootDrops,
      spaceshipHp: state.spaceshipHp,
      shieldEnergy: state.shieldEnergy
    };
  }

  const arena = arenaFromConfig(config);
  const damping = Math.max(0, 1 - config.lootDriftDampingPerSecond * secondsPerStep);
  const pullPerStep = config.lootMagnetAccelerationPerSecondSquared * secondsPerStep;
  const survivors: LootDropState[] = [];
  let spaceshipHp = state.spaceshipHp;
  let shieldEnergy = state.shieldEnergy;

  for (const drop of state.lootDrops) {
    const toShipX = state.spaceship.x - drop.x;
    const toShipY = state.spaceship.y - drop.y;
    const distance = Math.hypot(toShipX, toShipY);

    let velocityX = drop.velocity.x * damping;
    let velocityY = drop.velocity.y * damping;
    if (distance <= config.lootMagnetRadius && distance > 0) {
      velocityX += (toShipX / distance) * pullPerStep;
      velocityY += (toShipY / distance) * pullPerStep;
    }

    const moved: LootDropState = {
      ...drop,
      previousX: drop.x,
      previousY: drop.y,
      x: drop.x + velocityX * secondsPerStep,
      y: drop.y + velocityY * secondsPerStep,
      velocity: { x: velocityX, y: velocityY }
    };

    const reach = state.spaceship.radius + moved.radius;
    if (Math.hypot(state.spaceship.x - moved.x, state.spaceship.y - moved.y) <= reach) {
      if (moved.kind === "repair") {
        spaceshipHp = Math.min(state.ship.spaceshipMaxHp, spaceshipHp + moved.amount);
      } else {
        shieldEnergy = Math.min(shieldCapacity, shieldEnergy + moved.amount);
      }
      continue;
    }

    const expired = state.clock.tick - moved.spawnedTick >= moved.lifetimeTicks;
    const outside = !isWithinCircularEnvelope(moved.x, moved.y, moved.radius, arena, 0);
    if (!expired && !outside) survivors.push(moved);
  }

  return { lootDrops: survivors, spaceshipHp, shieldEnergy };
}
