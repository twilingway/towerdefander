/** How a threat reached the hull. Mirrors the three threat lists in `collisions.ts`. */
export type ThreatClass = "bullet" | "missile" | "asteroid";

/**
 * Quantities the step consumes internally, so no observer can rebuild them by
 * comparing two neighbouring states: the damage map is discarded at the end of
 * the tick, a point-blank shot is born and dies inside one step, and the shield
 * energy delta mixes block cost with drain and recharge.
 *
 * Monotonic for the whole run and never reset at a wave boundary — a per-wave
 * figure is the difference between two ticks, which keeps the core free of any
 * opinion about where a wave begins.
 *
 * Internal: `projectGameState` is an explicit field list and does not carry
 * these, so nothing here reaches @colyseus/schema or the protocol.
 */
export interface CombatRunStats {
  readonly shotsByCannon: number;
  readonly shotsByMachineGun: number;
  readonly hitsByCannon: number;
  readonly hitsByMachineGun: number;
  readonly damageDealtByCannon: number;
  readonly damageDealtByMachineGun: number;
  readonly damageTakenFromBullets: number;
  readonly damageTakenFromMissiles: number;
  readonly damageTakenFromAsteroids: number;
  readonly damageTakenFromBeams: number;
  readonly shieldBlocks: number;
  readonly shieldEnergySpentOnBlocks: number;
  /** Reached the hull with the sector up but the battery too low to pay for it. */
  readonly shieldOverdrawnHits: number;
  readonly creditsEarned: number;
  readonly creditsSpent: number;
  /** Killed by fire, as opposed to lifetime, the rim, or the intermission wipe. */
  readonly asteroidsDestroyed: number;
}

export function createRunStats(): CombatRunStats {
  return {
    shotsByCannon: 0,
    shotsByMachineGun: 0,
    hitsByCannon: 0,
    hitsByMachineGun: 0,
    damageDealtByCannon: 0,
    damageDealtByMachineGun: 0,
    damageTakenFromBullets: 0,
    damageTakenFromMissiles: 0,
    damageTakenFromAsteroids: 0,
    damageTakenFromBeams: 0,
    shieldBlocks: 0,
    shieldEnergySpentOnBlocks: 0,
    shieldOverdrawnHits: 0,
    creditsEarned: 0,
    creditsSpent: 0,
    asteroidsDestroyed: 0
  };
}

/**
 * One adder for every counter, so a resolver accumulates into plain locals the
 * way it already does for score and credits and pays a single allocation at the
 * end of its loop instead of one per collision.
 */
export function addRunStats(stats: CombatRunStats, delta: Partial<CombatRunStats>): CombatRunStats {
  return {
    shotsByCannon: stats.shotsByCannon + (delta.shotsByCannon ?? 0),
    shotsByMachineGun: stats.shotsByMachineGun + (delta.shotsByMachineGun ?? 0),
    hitsByCannon: stats.hitsByCannon + (delta.hitsByCannon ?? 0),
    hitsByMachineGun: stats.hitsByMachineGun + (delta.hitsByMachineGun ?? 0),
    damageDealtByCannon: stats.damageDealtByCannon + (delta.damageDealtByCannon ?? 0),
    damageDealtByMachineGun: stats.damageDealtByMachineGun + (delta.damageDealtByMachineGun ?? 0),
    damageTakenFromBullets: stats.damageTakenFromBullets + (delta.damageTakenFromBullets ?? 0),
    damageTakenFromMissiles: stats.damageTakenFromMissiles + (delta.damageTakenFromMissiles ?? 0),
    damageTakenFromAsteroids:
      stats.damageTakenFromAsteroids + (delta.damageTakenFromAsteroids ?? 0),
    damageTakenFromBeams: stats.damageTakenFromBeams + (delta.damageTakenFromBeams ?? 0),
    shieldBlocks: stats.shieldBlocks + (delta.shieldBlocks ?? 0),
    shieldEnergySpentOnBlocks:
      stats.shieldEnergySpentOnBlocks + (delta.shieldEnergySpentOnBlocks ?? 0),
    shieldOverdrawnHits: stats.shieldOverdrawnHits + (delta.shieldOverdrawnHits ?? 0),
    creditsEarned: stats.creditsEarned + (delta.creditsEarned ?? 0),
    creditsSpent: stats.creditsSpent + (delta.creditsSpent ?? 0),
    asteroidsDestroyed: stats.asteroidsDestroyed + (delta.asteroidsDestroyed ?? 0)
  };
}

/** Total health the run lost, which must equal the damage recorded against it. */
export function damageTaken(stats: CombatRunStats): number {
  return (
    stats.damageTakenFromBullets +
    stats.damageTakenFromMissiles +
    stats.damageTakenFromAsteroids +
    stats.damageTakenFromBeams
  );
}
