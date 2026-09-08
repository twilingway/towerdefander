import type { Predict } from "@colyseus/sdk";

import type { LiveEntityKind, PredictedPoseFrame } from "./shipPrediction.js";

/**
 * The shape the SDK's decoder hands a predicted room over in.
 *
 * Written out rather than imported because the SDK types it as the schema
 * class, and prediction reads live references off it - `predict.value(entity,
 * "x")` only works on the object the decoder owns, not on a copy.
 */
export interface DecodedPose extends PredictedPoseFrame {
  readonly $?: unknown;
}

/** One live entity as the decoder hands it over: identity, place, motion. */
export interface DecodedEntity {
  readonly entityId: string;
  x: number;
  y: number;
  readonly velocityX: number;
  readonly velocityY: number;
}

/** An entity that steers, and therefore publishes where it is pointing. */
export interface DecodedHull extends DecodedEntity {
  readonly heading: number;
}

export interface DecodedCollection {
  values(): IterableIterator<DecodedEntity>;
}

export interface DecodedDisplay {
  readonly pose?: DecodedPose;
  readonly enemyShips: DecodedCollection;
  readonly asteroids: DecodedCollection;
  readonly lootDrops: DecodedCollection;
  readonly friendlyProjectiles: DecodedCollection;
  readonly hostileProjectiles: DecodedCollection;
  readonly homingMissiles: DecodedCollection;
}

/** Which collections an entity of each kind can be found in. */
export const LIVE_COLLECTIONS: Record<LiveEntityKind, readonly (keyof DecodedDisplay)[]> = {
  enemy: ["enemyShips"],
  asteroid: ["asteroids"],
  loot: ["lootDrops"],
  projectile: ["friendlyProjectiles", "hostileProjectiles"],
  missile: ["homingMissiles"]
};

/** The kinds whose bearing is published and therefore interpolated as an angle. */
export const LIVE_KINDS_WITH_HEADING = new Set<LiveEntityKind>(["enemy", "missile"]);

export type PredictHandle = ReturnType<typeof Predict.get>;
