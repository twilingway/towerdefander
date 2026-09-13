import type { DisplayRoomView } from "@spaceship-defender/protocol";
import { getShieldStatusLabel } from "./combatHudViewModel.js";

/**
 * The example's status frame, as the numbers both prototypes of it read.
 *
 * The page draws the frame skin's status panel. Measured against a prototype
 * in the scene, the page version added nothing over the classic HUD and the
 * scene's did (hud-skin-choice design, decision 3).
 */

type Game = NonNullable<DisplayRoomView["game"]>;

/** The source picture's own size; every rectangle below is in its pixels. */
export const STATUS_FRAME_WIDTH = 1154;
export const STATUS_FRAME_HEIGHT = 636;

export interface StatusBar {
  readonly key: "cannon" | "hull" | "shield" | "machineGun";
  readonly label: string;
  /** Cells the frame paints for this bar: eleven on the top one, ten on the others. */
  readonly cells: number;
  /** The first cell's top-left corner, one cell's size, and the step to the next. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly pitch: number;
  /** Left edge and vertical middle of the caption, inside the bar's long capsule. */
  readonly labelX: number;
  readonly labelY: number;
  /** The colour the example's own `bar()` lights this bar with. */
  readonly color: number;
}

/**
 * Measured off the source by brightness, not read off a spec: the top bar paints
 * eleven narrow slots, the three below it ten square ones.
 */
export const STATUS_BARS: readonly [StatusBar, StatusBar, StatusBar, StatusBar] = [
  {
    key: "cannon",
    label: "Пушка",
    cells: 11,
    x: 499,
    y: 80,
    width: 19,
    height: 77,
    pitch: 32.1,
    labelX: 250,
    labelY: 118,
    color: 0x50dcff
  },
  {
    key: "hull",
    label: "Корпус",
    cells: 10,
    x: 532,
    y: 275,
    width: 49,
    height: 48,
    pitch: 53.36,
    labelX: 200,
    labelY: 299,
    color: 0x50e591
  },
  {
    key: "shield",
    label: "Щит",
    cells: 10,
    x: 532,
    y: 413,
    width: 49,
    height: 48,
    pitch: 53.36,
    labelX: 200,
    labelY: 437,
    color: 0x45c8ff
  },
  {
    key: "machineGun",
    label: "Пулемёт",
    cells: 10,
    x: 532,
    y: 550,
    width: 49,
    height: 49,
    pitch: 53.36,
    labelX: 200,
    labelY: 574,
    color: 0xffd452
  }
];

/** Lit cells for a value against its capacity: the only thing either prototype compares. */
export function litSegments(value: number, capacity: number, cells: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(capacity) || capacity <= 0) return 0;
  return Math.round(Math.min(1, Math.max(0, value / capacity)) * cells);
}

/** Lit cells per bar, in `STATUS_BARS` order. */
export type StatusLit = readonly [number, number, number, number];

/** Heat is the heat built up, not what is left of the barrel, as in the campaign header. */
export function readStatusLit(
  game: Pick<Game, "cannon" | "spaceship" | "shield" | "machineGun">
): StatusLit {
  const [cannon, hull, shield, machineGun] = STATUS_BARS;
  return [
    litSegments(game.cannon.heat, game.cannon.capacity, cannon.cells),
    litSegments(game.spaceship.hp, game.spaceship.maxHp, hull.cells),
    litSegments(game.shield.energy, game.shield.capacity, shield.cells),
    litSegments(game.machineGun.heat, game.machineGun.capacity, machineGun.cells)
  ];
}

export function sameStatusLit(left: StatusLit | null, right: StatusLit | null): boolean {
  if (left === right) return true;
  if (left === null || right === null) return false;
  return (
    left[0] === right[0] && left[1] === right[1] && left[2] === right[2] && left[3] === right[3]
  );
}

/** At or under this share of its hull the ship reads as in danger, as the match gauges say. */
export const LOW_HULL_SHARE = 0.35;

/** Everything the status frame draws, and so everything it compares. */
export interface StatusReading {
  readonly lit: StatusLit;
  readonly cannonOverheated: boolean;
  readonly machineGunOverheated: boolean;
  /** What the shield is doing while it is not up, in the classic dial's words; null while it is. */
  readonly shieldState: string | null;
  readonly hullLow: boolean;
  /** Only a match carries the sweep, on the button the frame's pause was cut from. */
  readonly scan: {
    readonly readySeconds: number;
    readonly revealSecondsRemaining: number;
  } | null;
}

export function readStatusReading(
  game: Pick<
    Game,
    | "cannon"
    | "spaceship"
    | "shield"
    | "shieldPhase"
    | "machineGun"
    | "arenaShips"
    | "scanReadySeconds"
    | "scanRevealSecondsRemaining"
  >
): StatusReading {
  return {
    lit: readStatusLit(game),
    cannonOverheated: game.cannon.overheated,
    machineGunOverheated: game.machineGun.overheated,
    shieldState: game.shield.active
      ? null
      : getShieldStatusLabel(game.shieldPhase, game.shield.rearmRequired, game.shield.energy),
    hullLow: game.spaceship.maxHp > 0 && game.spaceship.hp / game.spaceship.maxHp <= LOW_HULL_SHARE,
    scan:
      game.arenaShips.length > 0
        ? {
            readySeconds: game.scanReadySeconds,
            revealSecondsRemaining: game.scanRevealSecondsRemaining
          }
        : null
  };
}

/** A new reading is a new drawing only when a count, a state or the sweep's clock moved. */
export function sameStatusReading(
  left: StatusReading | null,
  right: StatusReading | null
): boolean {
  if (left === right) return true;
  if (left === null || right === null) return false;
  return (
    sameStatusLit(left.lit, right.lit) &&
    left.cannonOverheated === right.cannonOverheated &&
    left.machineGunOverheated === right.machineGunOverheated &&
    left.shieldState === right.shieldState &&
    left.hullLow === right.hullLow &&
    left.scan?.readySeconds === right.scan?.readySeconds &&
    left.scan?.revealSecondsRemaining === right.scan?.revealSecondsRemaining
  );
}
