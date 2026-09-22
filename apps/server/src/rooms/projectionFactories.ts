import type { ProjectionFactories } from "@spaceship-defender/game-runtime";

import {
  AsteroidState,
  EnemyState,
  HomingMissileState,
  LaserBeamState,
  LootDropState,
  ProjectileState,
  ShipStatEffectState,
  UpgradeCardState,
  UpgradeVoteState
} from "./SpaceshipDefenderState.js";

/**
 * How this host makes an element of a projected collection.
 *
 * The projection itself no longer knows about the wire: a device fills ordinary
 * objects with it. What a `MapSchema` holds, though, has to be a `Schema` or it
 * is never encoded, so the classes are handed over here and nowhere else.
 */
export const SCHEMA_PROJECTION_FACTORIES: ProjectionFactories = {
  enemy: () => new EnemyState(),
  asteroid: () => new AsteroidState(),
  lootDrop: () => new LootDropState(),
  laserBeam: () => new LaserBeamState(),
  projectile: () => new ProjectileState(),
  homingMissile: () => new HomingMissileState(),
  upgradeCard: () => new UpgradeCardState(),
  upgradeVote: () => new UpgradeVoteState(),
  statEffect: () => new ShipStatEffectState()
};
