import { isDiagnosticsRequested } from "../../model/diagnostics.js";
import type { CombatVisual } from "./entities.js";

/**
 * What the scene drew, frame by frame, for a browser spec to measure.
 *
 * The question it answers is the one an operator asks by eye - does a shell
 * leave the barrel that is drawn firing it - and it answers it with numbers the
 * spec computes itself: the authoritative point a shell was born at, the drawn
 * barrel over time, and the drawn shell. None of the scene's clocks are in it,
 * because they are what is being tested.
 *
 * Published only under `?diag=1`, the same switch the other instruments hang
 * from; without it the scene holds `undefined` and pays one comparison a frame.
 */

/** One shell as drawn, plus the authoritative facts it was drawn from. */
export interface ProbedShell {
  readonly id: string;
  /** Fired by the hull this page draws as its own. */
  readonly own: boolean;
  readonly source: string;
  readonly radius: number;
  readonly visible: boolean;
  readonly x: number;
  readonly y: number;
  readonly velocityX: number;
  readonly velocityY: number;
  /** The authoritative position at `spawnTick`, carried back along the velocity. */
  readonly birthX: number;
  readonly birthY: number;
  readonly spawnTick: number;
}

export interface ProbedFrame {
  /** The frame's own timestamp, in the page's `performance.now()` milliseconds. */
  readonly time: number;
  readonly hullX: number;
  readonly hullY: number;
  readonly heading: number;
  readonly mountX: number;
  readonly mountY: number;
  readonly turretRotation: number;
  readonly hullRadius: number;
  /** Every other hull drawn this frame, flat: x, y, radius, x, y, radius, ... */
  readonly hulls: readonly number[];
  readonly shells: readonly ProbedShell[];
}

export interface ShellProbeGlobal {
  readonly stepMs: number;
  readonly frames: ProbedFrame[];
}

/** About ten seconds at sixty frames; the spec reads and clears long before. */
const FRAME_CAPACITY = 600;

export interface ShellProbe {
  /** Takes the frame as a thunk, so building it is inside the guard too. */
  record(frame: () => ProbedFrame): void;
}

/** The own hull as the scene drew it this frame. */
export interface ProbedPose {
  readonly x: number;
  readonly y: number;
  readonly heading: number;
  readonly mountX: number;
  readonly mountY: number;
  readonly turretRotation: number;
  readonly hullRadius: number;
}

/**
 * One frame, read off the objects the scene has just placed.
 *
 * Only called when the probe exists, so the allocations here are paid by a page
 * that asked to be measured and by nobody else.
 */
export function probeFrame(
  time: number,
  pose: ProbedPose,
  visuals: ReadonlyMap<string, CombatVisual>,
  appendFleet: (into: number[]) => void
): ProbedFrame {
  const hulls: number[] = [];
  const shells: ProbedShell[] = [];
  for (const [id, visual] of visuals) {
    if (visual.kind === "enemy") {
      hulls.push(visual.object.x, visual.object.y, visual.radius);
      continue;
    }
    const shell = visual.shell;
    if (shell === undefined) continue;
    shells.push({
      id,
      own: shell.own,
      source: shell.source,
      radius: visual.radius,
      visible: visual.object.visible,
      x: visual.object.x,
      y: visual.object.y,
      velocityX: visual.velocity?.x ?? 0,
      velocityY: visual.velocity?.y ?? 0,
      birthX: shell.birthX,
      birthY: shell.birthY,
      spawnTick: shell.spawnTick
    });
  }
  appendFleet(hulls);
  return {
    time,
    hullX: pose.x,
    hullY: pose.y,
    heading: pose.heading,
    mountX: pose.mountX,
    mountY: pose.mountY,
    turretRotation: pose.turretRotation,
    hullRadius: pose.hullRadius,
    hulls,
    shells
  };
}

export function createShellProbe(search: string, stepMs: number): ShellProbe | undefined {
  if (!isDiagnosticsRequested(search)) return undefined;
  const published: ShellProbeGlobal = { stepMs, frames: [] };
  (globalThis as { __spaceshipShellProbe?: ShellProbeGlobal }).__spaceshipShellProbe = published;
  return {
    record(frame) {
      /*
       * Never allowed to throw: this runs inside `updateScene`, and an exception
       * there stops Phaser's loop - the instrument would take down the very
       * picture it is measuring.
       */
      try {
        published.frames.push(frame());
        if (published.frames.length > FRAME_CAPACITY) published.frames.shift();
      } catch {
        // A measurement lost is a measurement lost; the frame still draws.
      }
    }
  };
}
