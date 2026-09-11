import { type ArenaMatchConfig } from "./arenaMatchTypes.ts";

/**
 * Where the ring is, and where it is going.
 *
 * The safe radius runs linearly from the phase it left to the phase it is
 * closing on, so the boundary moves every tick instead of jumping once a phase.
 * A crew can therefore see it coming, which is the whole point of publishing
 * the next radius beside the current one.
 */
export interface ArenaRingPosition {
  readonly phaseIndex: number;
  readonly radius: number;
  readonly nextRadius: number;
  readonly ticksRemaining: number;
}

export function ringPositionAt(tick: number, config: ArenaMatchConfig): ArenaRingPosition {
  const phases = config.ringPhases;
  if (phases.length === 0) {
    return {
      phaseIndex: 0,
      radius: config.arenaRadius,
      nextRadius: config.arenaRadius,
      ticksRemaining: 0
    };
  }

  let phaseStartTick = 0;
  let previousRadius = config.arenaRadius;
  for (let index = 0; index < phases.length; index += 1) {
    const phase = phases[index];
    if (phase === undefined) continue;
    const phaseEndTick = phaseStartTick + phase.durationTicks;
    if (tick < phaseEndTick) {
      const elapsed = tick - phaseStartTick;
      const progress = phase.durationTicks === 0 ? 1 : elapsed / phase.durationTicks;
      const radius = previousRadius + (phase.radius - previousRadius) * progress;
      const next = phases[index + 1];
      return {
        phaseIndex: index,
        radius,
        nextRadius: next === undefined ? phase.radius : next.radius,
        ticksRemaining: phaseEndTick - tick
      };
    }
    phaseStartTick = phaseEndTick;
    previousRadius = phase.radius;
  }

  const last = phases.at(-1);
  if (last === undefined) {
    return {
      phaseIndex: 0,
      radius: config.arenaRadius,
      nextRadius: config.arenaRadius,
      ticksRemaining: 0
    };
  }
  return {
    phaseIndex: phases.length - 1,
    radius: last.radius,
    nextRadius: last.radius,
    ticksRemaining: 0
  };
}

/**
 * Hull damage this step for a ship at `distance` from the centre.
 *
 * Zero on the boundary itself and growing with the depth of the excursion, so
 * clipping the edge costs a scratch and sitting outside costs the match. The
 * caller applies it straight to the hull: this is the one damage in the game
 * the shield does not intercept, because a hull tank would otherwise simply
 * wait the ring out and the whole mechanic would stop working.
 *
 * The rate is a share of the hull's own maximum, which is what makes the last
 * phase arithmetic rather than a guess: at `60` shares a second and sixty steps
 * a second, one step takes a whole hull, so everyone still outside dies on the
 * same tick and a match cannot run forever. Only a hull that healed inside that
 * step lives to see the next one.
 */
export function ringDamageForStep(
  distance: number,
  ring: ArenaRingPosition,
  config: ArenaMatchConfig,
  maxHp: number
): number {
  const depth = distance - ring.radius;
  if (depth <= 0) return 0;

  const phase = config.ringPhases[ring.phaseIndex];
  if (phase === undefined) return 0;

  const secondsPerStep = config.ship.fixedStepMs / 1000;
  // Full rate once a ship is a hull radius outside; a scratch right on the line.
  const hullRadius = Math.max(1, config.ship.spaceshipRadius);
  const severity = Math.min(1, depth / hullRadius);
  return maxHp * phase.damageShareOfMaxHpPerSecond * severity * secondsPerStep;
}
