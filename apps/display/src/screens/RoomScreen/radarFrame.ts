import type { DisplayGameSnapshot } from "@spaceship-defender/protocol";

type Game = DisplayGameSnapshot;

/**
 * What the radar reads, and nothing else.
 *
 * The dial is drawn on a worker's thread when the browser allows it, and every
 * field here crosses to that thread thirty times a second - so the frame is the
 * handful of numbers the painter touches, not the whole snapshot. A full
 * snapshot also satisfies this type, which is why the painter can keep taking
 * either and the tests keep handing it one.
 */
export interface RadarFrame {
  readonly arenaRadius: Game["arenaRadius"];
  readonly worldWidth: Game["worldWidth"];
  readonly worldHeight: Game["worldHeight"];
  readonly spaceship: Pick<
    Game["spaceship"],
    "x" | "y" | "heading" | "hp" | "maxHp" | "velocityX" | "velocityY"
  >;
  readonly shield: Pick<Game["shield"], "energy" | "capacity">;
  readonly asteroids: readonly Pick<Game["asteroids"][number], "x" | "y" | "origin">[];
  readonly lootDrops: readonly Pick<Game["lootDrops"][number], "x" | "y" | "kind">[];
  readonly enemyShips: readonly Pick<Game["enemyShips"][number], "x" | "y">[];
  readonly arenaZones: readonly Pick<
    Game["arenaZones"][number],
    "x" | "y" | "width" | "height" | "state"
  >[];
  readonly arenaLoot: readonly Pick<Game["arenaLoot"][number], "x" | "y" | "kind" | "revealed">[];
  readonly arenaShips: readonly Pick<
    Game["arenaShips"][number],
    "x" | "y" | "isSelf" | "revealed" | "alive"
  >[];
}

export function toRadarFrame(game: Game): RadarFrame {
  const ship = game.spaceship;
  return {
    arenaRadius: game.arenaRadius,
    worldWidth: game.worldWidth,
    worldHeight: game.worldHeight,
    spaceship: {
      x: ship.x,
      y: ship.y,
      heading: ship.heading,
      hp: ship.hp,
      maxHp: ship.maxHp,
      velocityX: ship.velocityX,
      velocityY: ship.velocityY
    },
    shield: { energy: game.shield.energy, capacity: game.shield.capacity },
    asteroids: game.asteroids.map(({ x, y, origin }) => ({ x, y, origin })),
    lootDrops: game.lootDrops.map(({ x, y, kind }) => ({ x, y, kind })),
    enemyShips: game.enemyShips.map(({ x, y }) => ({ x, y })),
    arenaZones: game.arenaZones.map(({ x, y, width, height, state }) => ({
      x,
      y,
      width,
      height,
      state
    })),
    arenaLoot: game.arenaLoot.map(({ x, y, kind, revealed }) => ({ x, y, kind, revealed })),
    arenaShips: game.arenaShips.map(({ x, y, isSelf, revealed, alive }) => ({
      x,
      y,
      isSelf,
      revealed,
      alive
    }))
  };
}
