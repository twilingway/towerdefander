import { SIMULATION_TICK_RATE } from "@spaceship-defender/game-core";

/**
 * The clock a shell is drawn on.
 *
 * A frame carries three clocks at once. The page's own hull is drawn on one -
 * predicted ahead of the room in a networked cockpit, the newest step in a
 * device run. The world's hulls are drawn on another, interpolated behind the
 * newest snapshot. And the room's shells used to be drawn on a third, the
 * newest authoritative moment. A shell drawn on a clock its shooter is not
 * drawn on comes out of empty space: behind a moving own barrel by the hull's
 * speed times the lead, ahead of an enemy's by the shell's speed times the
 * interpolation delay.
 *
 * So a shell is born on its shooter's clock - the own hull's for the page's own
 * shells, the world's for everyone else's - and is then walked, a quarter of
 * real time at a time, to the authoritative present, which is where hits are
 * decided and where it used to be drawn. It leaves the barrel exactly, it lands
 * where it always landed, and in between its drawn speed is off by at most a
 * quarter.
 *
 * All clocks are in fractional simulation ticks.
 */

export interface ShellClocks {
  /** The authoritative present shells settle on. */
  readonly present: number;
  /** The clock the world's hulls are drawn on. */
  readonly world: number;
  /** The clock the page's own hull is drawn on. */
  readonly own: number;
}

/** How fast a shell's clock closes on the present, in ticks per tick of real time. */
export const SHELL_CLOCK_WARP_RATE = 0.25;

export interface ShellClockState {
  /** Ticks this shell's clock is ahead of (positive) or behind the present. */
  offset: number;
  /** Once drawn, the shell stops following its shooter's clock and settles. */
  born: boolean;
}

/**
 * A new shell's clock. One made by a hydration is already in the air and was
 * never seen leaving a barrel, so it is born settled on the present.
 */
export function createShellClockState(settled: boolean): ShellClockState {
  return { offset: 0, born: settled };
}

/**
 * Advances one shell's clock by a frame and returns the tick to draw it at, or
 * undefined while its shooter's clock has not yet reached its birth.
 */
export function advanceShellClock(
  state: ShellClockState,
  own: boolean,
  spawnTick: number,
  clocks: ShellClocks,
  elapsedTicks: number
): number | undefined {
  if (!state.born) {
    state.offset = (own ? clocks.own : clocks.world) - clocks.present;
    if (clocks.present + state.offset < spawnTick) return undefined;
    state.born = true;
    return clocks.present + state.offset;
  }
  const step = SHELL_CLOCK_WARP_RATE * Math.max(0, elapsedTicks);
  state.offset =
    state.offset > 0 ? Math.max(0, state.offset - step) : Math.min(0, state.offset + step);
  return clocks.present + state.offset;
}

/** A straight, constant-speed shell carried from one authoritative sample to `tick`. */
export function shellPositionAt(
  sample: { readonly x: number; readonly y: number },
  sampleTick: number,
  velocity: { readonly x: number; readonly y: number },
  tick: number
): { x: number; y: number } {
  const seconds = (tick - sampleTick) / SIMULATION_TICK_RATE;
  return { x: sample.x + velocity.x * seconds, y: sample.y + velocity.y * seconds };
}

/** The sprite side of a shell, as narrow as placing it needs. */
export interface PlacedShell {
  readonly object: {
    setPosition(x: number, y: number): unknown;
    setVisible(visible: boolean): unknown;
    rotation: number;
  };
  readonly velocity: { readonly x: number; readonly y: number } | undefined;
}

/** A shell's flight as the scene keeps it between frames. */
export interface ShellFlight {
  readonly own: boolean;
  readonly spawnTick: number;
  readonly clock: ShellClockState;
  lastX: number;
  lastY: number;
  lastTick: number;
  drawnTick: number | undefined;
  /** Set once the room has dropped the shell; it then flies on from `last*`. */
  retireAtTick: number | undefined;
}

/**
 * Draws one shell for this frame: hidden until its shooter's clock reaches its
 * birth, then carried from its newest authoritative sample to its own clock.
 * A shell the room has dropped flies on from the last sample it had.
 *
 * Returns the tick it was drawn at, or undefined while it is not yet born.
 */
export function placeShell(
  shell: PlacedShell,
  flight: ShellFlight,
  sample: { readonly x: number; readonly y: number },
  sampleTick: number,
  clocks: ShellClocks,
  elapsedTicks: number
): number | undefined {
  if (flight.retireAtTick === undefined) {
    flight.lastX = sample.x;
    flight.lastY = sample.y;
    flight.lastTick = sampleTick;
  }
  const tick = advanceShellClock(flight.clock, flight.own, flight.spawnTick, clocks, elapsedTicks);
  flight.drawnTick = tick;
  if (tick === undefined) {
    shell.object.setVisible(false);
    return undefined;
  }
  // Inline rather than through `shellPositionAt`: this runs per shell per frame,
  // and an object each time is a steady trickle of garbage for nothing.
  const vx = shell.velocity?.x ?? 0;
  const vy = shell.velocity?.y ?? 0;
  const seconds = (tick - flight.lastTick) / SIMULATION_TICK_RATE;
  shell.object.setVisible(true);
  shell.object.setPosition(flight.lastX + vx * seconds, flight.lastY + vy * seconds);
  // A shell points where it is going, and that never changes while it flies.
  shell.object.rotation = Math.atan2(vy, vx);
  return tick;
}

/**
 * Whether a dropped shell may leave now: its clock has reached the last tick
 * the room had it at - or it has lingered a second past the present, which no
 * warp this side of the protocol takes, so it is stuck and goes anyway.
 */
export function shellMayRetire(flight: ShellFlight, present: number): boolean {
  const until = flight.retireAtTick;
  if (until === undefined) return false;
  if (present - until > SIMULATION_TICK_RATE) return true;
  return flight.drawnTick !== undefined && flight.drawnTick >= until;
}
