/**
 * How long the crew has left, counted in the run's own ticks.
 *
 * The room counts it against a wall clock, because a room is a process with a
 * timer and players whose phones disagree about the time. A device has neither:
 * it has the run it is stepping, and nothing else to compare against. Counting
 * ticks also makes a pause free - a hidden tab spends no wave time, which is
 * what a single player would expect and what a room cannot offer.
 */
export interface WaveDeadline {
  /** The tick the wave is lost on; undefined while no wave is being timed. */
  readonly atTick: number | undefined;
}

export const NO_WAVE_DEADLINE: WaveDeadline = { atTick: undefined };

export function armWaveDeadline(tick: number, ttlSeconds: number, stepMs: number): WaveDeadline {
  const ticks = Math.max(1, Math.round((ttlSeconds * 1000) / stepMs));
  return { atTick: tick + ticks };
}

/**
 * Keeps the wave open while salvage is still on the field.
 *
 * Never shortens it: a window that closed early would take the loot with it,
 * and the crew earned that by clearing the wave.
 */
export function extendForSalvage(
  deadline: WaveDeadline,
  tick: number,
  lootWindowTicksRemaining: number,
  slackTicks: number
): WaveDeadline {
  if (deadline.atTick === undefined) return deadline;
  const wanted = tick + lootWindowTicksRemaining + slackTicks;
  return wanted > deadline.atTick ? { atTick: wanted } : deadline;
}

export function isWaveExpired(deadline: WaveDeadline, tick: number): boolean {
  return deadline.atTick !== undefined && tick >= deadline.atTick;
}

/**
 * What the projection publishes: whole seconds, never zero while a wave runs.
 *
 * Zero is what the display reads as "no wave is being timed", so a wave with
 * half a second left has to say one rather than round itself away.
 */
export function waveSecondsRemaining(deadline: WaveDeadline, tick: number, stepMs: number): number {
  if (deadline.atTick === undefined) return 0;
  const ticksLeft = deadline.atTick - tick;
  if (ticksLeft <= 0) return 0;
  return Math.max(1, Math.ceil((ticksLeft * stepMs) / 1000));
}
