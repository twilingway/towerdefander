/**
 * The world these positions were laid out against. A run with another arena
 * radius scales them by its own world, so the composition follows the arena
 * instead of bunching into one corner of a larger one.
 */
export const DECORATION_REFERENCE_WORLD = 4400;

/** Static scenery published once per run; purely decorative, never simulated. */
export const DECORATIVE_OBSTACLES = [
  { obstacleId: "island-northwest", kind: "circle" as const, x: 760, y: 760, radius: 105 },
  {
    obstacleId: "ruins-north",
    kind: "rectangle" as const,
    x: 2200,
    y: 390,
    width: 250,
    height: 120
  },
  {
    obstacleId: "cloud-northeast",
    kind: "rectangle" as const,
    x: 3650,
    y: 850,
    width: 330,
    height: 150
  },
  { obstacleId: "island-west", kind: "circle" as const, x: 850, y: 1740, radius: 135 },
  {
    obstacleId: "ruins-center-west",
    kind: "rectangle" as const,
    x: 1980,
    y: 1420,
    width: 220,
    height: 180
  },
  { obstacleId: "island-center-east", kind: "circle" as const, x: 2820, y: 1840, radius: 90 },
  { obstacleId: "island-southwest", kind: "circle" as const, x: 900, y: 2700, radius: 120 },
  {
    obstacleId: "cloud-southeast",
    kind: "rectangle" as const,
    x: 4040,
    y: 2600,
    width: 300,
    height: 140
  },
  {
    obstacleId: "ruins-south",
    kind: "rectangle" as const,
    x: 2500,
    y: 2760,
    width: 240,
    height: 170
  }
] as const;
