import { SIMULATION_TICK_RATE } from "@spaceship-defender/game-core";
import { describe, expect, it } from "vitest";

import {
  SHELL_CLOCK_WARP_RATE,
  advanceShellClock,
  createShellClockState,
  placeShell,
  shellMayRetire,
  shellPositionAt,
  type ShellClocks,
  type ShellFlight
} from "./shellClock.js";

const at = (present: number, world: number, own: number): ShellClocks => ({
  present,
  world,
  own
});

describe("advanceShellClock", () => {
  it("births an own shell on the own hull's clock", () => {
    const state = createShellClockState(false);
    expect(advanceShellClock(state, true, 100, at(102, 95, 106), 1)).toBe(106);
  });

  it("births a foreign shell on the world's clock", () => {
    const state = createShellClockState(false);
    expect(advanceShellClock(state, false, 100, at(110, 104, 112), 1)).toBe(104);
  });

  it("keeps a shell hidden until its shooter's clock reaches its birth", () => {
    const state = createShellClockState(false);
    // The snapshot already holds it, the world is still drawn before it fired.
    expect(advanceShellClock(state, false, 100, at(106, 97, 108), 1)).toBeUndefined();
    expect(advanceShellClock(state, false, 100, at(108, 99.5, 110), 2)).toBeUndefined();
    expect(advanceShellClock(state, false, 100, at(109, 100.5, 111), 1)).toBe(100.5);
  });

  it("walks an own shell back to the present at a quarter of real time", () => {
    const state = createShellClockState(false);
    advanceShellClock(state, true, 100, at(100, 94, 104), 0);
    let drawn = 104;
    let present = 100;
    for (let frame = 0; frame < 20; frame += 1) {
      present += 1;
      const next = advanceShellClock(state, true, 100, at(present, present - 6, present + 4), 1);
      if (next === undefined) throw new Error("a born shell vanished");
      // Slow while it is ahead, never slower than the band, never faster than real time.
      expect(next - drawn).toBeGreaterThanOrEqual(1 - SHELL_CLOCK_WARP_RATE - 1e-9);
      expect(next - drawn).toBeLessThanOrEqual(1 + 1e-9);
      if (frame === 0) expect(next - drawn).toBeCloseTo(1 - SHELL_CLOCK_WARP_RATE);
      drawn = next;
    }
    // Four ticks ahead at a quarter a tick: settled after sixteen, and stays there.
    expect(drawn).toBe(present);
  });

  it("walks a foreign shell forward to the present no faster than the band", () => {
    const state = createShellClockState(false);
    advanceShellClock(state, false, 100, at(106, 100, 108), 0);
    let drawn = 100;
    let present = 106;
    for (let frame = 0; frame < 40; frame += 1) {
      present += 1;
      const next = advanceShellClock(state, false, 100, at(present, present - 6, present + 2), 1);
      if (next === undefined) throw new Error("a born shell vanished");
      expect(next - drawn).toBeLessThanOrEqual(1 + SHELL_CLOCK_WARP_RATE + 1e-9);
      drawn = next;
    }
    expect(drawn).toBe(present);
    // Settled means it no longer follows the world: a lurch there is not its business.
    expect(advanceShellClock(state, false, 100, at(present + 1, present - 20, present), 1)).toBe(
      present + 1
    );
  });

  it("puts a shell made by a hydration straight on the present", () => {
    const state = createShellClockState(true);
    expect(advanceShellClock(state, false, 10, at(50, 40, 55), 1)).toBe(50);
  });
});

describe("shellPositionAt", () => {
  it("carries a sample along the velocity by whole and fractional ticks", () => {
    const sample = { x: 100, y: 200 };
    const velocity = { x: SIMULATION_TICK_RATE * 3, y: -SIMULATION_TICK_RATE };
    expect(shellPositionAt(sample, 40, velocity, 42.5)).toEqual({ x: 107.5, y: 197.5 });
    expect(shellPositionAt(sample, 40, velocity, 38)).toEqual({ x: 94, y: 202 });
  });
});

describe("a shell the room has dropped", () => {
  const sprite = () => {
    const drawn = { x: 0, y: 0, visible: false, rotation: 0 };
    return {
      drawn,
      object: {
        setPosition: (x: number, y: number) => {
          drawn.x = x;
          drawn.y = y;
        },
        setVisible: (visible: boolean) => {
          drawn.visible = visible;
        },
        rotation: 0
      },
      velocity: { x: SIMULATION_TICK_RATE * 10, y: 0 }
    };
  };
  const flight = (): ShellFlight => ({
    own: false,
    spawnTick: 100,
    clock: createShellClockState(false),
    lastX: 0,
    lastY: 0,
    lastTick: 0,
    drawnTick: undefined,
    retireAtTick: undefined
  });

  it("flies on from its last sample until its clock reaches where it left", () => {
    const shell = sprite();
    const state = flight();
    // Seen at tick 110 at x = 100; the world is drawn six ticks behind.
    placeShell(shell, state, { x: 100, y: 0 }, 110, at(110, 104, 112), 1);
    expect(shell.drawn.x).toBe(40);
    // The room drops it; its sample would now be meaningless, so it is ignored.
    state.retireAtTick = 110;
    placeShell(shell, state, { x: 9_999, y: 0 }, 111, at(111, 105, 113), 1);
    expect(shell.drawn.x).toBeCloseTo(100 - 10 * (6 - SHELL_CLOCK_WARP_RATE - 1));
    expect(shellMayRetire(state, 111)).toBe(false);
    for (let present = 112; present < 120; present += 1) {
      placeShell(
        shell,
        state,
        { x: 9_999, y: 0 },
        present,
        at(present, present - 6, present + 2),
        1
      );
    }
    // Five and a quarter ticks behind at 1.25 a tick: at tick 110 by now.
    expect(state.drawnTick).toBeGreaterThanOrEqual(110);
    expect(shellMayRetire(state, 119)).toBe(true);
  });

  it("goes anyway once it has lingered a second past the present", () => {
    const state = flight();
    state.retireAtTick = 50;
    expect(shellMayRetire(state, 50 + SIMULATION_TICK_RATE)).toBe(false);
    expect(shellMayRetire(state, 51 + SIMULATION_TICK_RATE)).toBe(true);
  });

  it("is never retired while the room still has it", () => {
    const state = flight();
    state.drawnTick = 10_000;
    expect(shellMayRetire(state, 10_000)).toBe(false);
  });
});
