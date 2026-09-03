/**
 * The ship's own numbers, as state rather than as configuration.
 *
 * A run starts with the preset's values and every purchased module edits them,
 * so the simulation must read them from the state it is handed: a stat read
 * back off the config is a module that silently does nothing. `shipStats.test`
 * holds the per-field guard that keeps it that way.
 */

/**
 * Every numeric field of the flat player-ship block. It mirrors
 * `PLAYER_SHIP_FIELDS` in the balance migration, which fills the same block
 * from defaults; the migration imports this list so the two cannot drift.
 */
export const SHIP_STAT_FIELDS = [
  "spaceshipMaxHp",
  "spaceshipRadius",
  "spaceshipSpeedPerSecond",
  "spaceshipAccelerationPerSecondSquared",
  "spaceshipBrakingPerSecondSquared",
  "spaceshipReverseSpeedFactor",
  "headingMaxAngularSpeedPerSecond",
  "headingAngularAccelerationPerSecondSquared",
  "headingAngularBrakingPerSecondSquared",
  "friendlyProjectileDamage",
  "fireCooldownTicks",
  "projectileSpeedPerSecond",
  "projectileRadius",
  "projectileLifetimeMs",
  "turretMaxAngularSpeedPerSecond",
  "turretAngularAccelerationPerSecondSquared",
  "turretAngularBrakingPerSecondSquared",
  "cannonHeatCapacity",
  "cannonHeatPerShot",
  "cannonCoolingPerSecond",
  "cannonRearmThreshold",
  "mgDamage",
  "mgFireCooldownTicks",
  "mgProjectileSpeedPerSecond",
  "mgProjectileRadius",
  "mgHeatCapacity",
  "mgHeatPerShot",
  "mgCoolingPerSecond",
  "mgRearmThreshold",
  "cannonLaserRange",
  "mgLaserRange",
  "laserBeamRadius",
  "friendlyMissileTurnRatePerSecond",
  "friendlyMissileAcquireConeRadians",
  "shieldCapacity",
  "shieldDrainPerSecond",
  "shieldRechargePerSecond",
  "shieldEngageTicks",
  "shieldMinimumUpTicks",
  "shieldCooldownTicks",
  "shieldRearmEnergy",
  "shieldRadius",
  "shieldArcRadians",
  "shieldMaxAngularSpeedPerSecond",
  "shieldAngularAccelerationPerSecondSquared",
  "shieldAngularBrakingPerSecondSquared"
] as const;

export type ShipStatField = (typeof SHIP_STAT_FIELDS)[number];
export type ShipStats = Readonly<Record<ShipStatField, number>>;

/**
 * Fields a module may not address, because the clients receive them once per
 * run: the display draws the shield arc at `shieldRadius`, and the controller
 * predicts the helm with the hull's braking. A module on either would leave the
 * published value stale, and the only symptom would be that the picture is
 * slightly wrong.
 */
export const MODULE_TARGET_EXCLUSIONS = [
  "shieldRadius",
  "headingAngularBrakingPerSecondSquared"
] as const;

export type ModuleTargetField = Exclude<ShipStatField, (typeof MODULE_TARGET_EXCLUSIONS)[number]>;

export const MODULE_TARGET_FIELDS: readonly ModuleTargetField[] = SHIP_STAT_FIELDS.filter(
  (field): field is ModuleTargetField =>
    !(MODULE_TARGET_EXCLUSIONS as readonly string[]).includes(field)
);

/** Additions sum, percents sum with each other, multipliers multiply. */
export const SHIP_STAT_OPS = ["add", "percent", "multiply"] as const;
export type ShipStatOp = (typeof SHIP_STAT_OPS)[number];

export interface ShipStatEffect {
  readonly target: ModuleTargetField;
  readonly op: ShipStatOp;
  readonly value: number;
}

interface ShipStatRule {
  readonly min?: number;
  readonly max?: number;
  /** Floor expressed against the run's own base, for fields with no absolute one. */
  readonly minShareOfBase?: number;
  readonly round?: "ceil";
}

/**
 * Clamps and rounding belong to the code, not to the preset: an operator who
 * zeroes a heat capacity should get a refused document, not a division by zero
 * in a file they have never opened.
 *
 * Only fields with a rule of their own appear here; everything else is held at
 * zero from below, because none of these quantities means anything negative.
 */
const SHIP_STAT_RULES: Partial<Readonly<Record<ShipStatField, ShipStatRule>>> = {
  // A cooldown is counted in whole ticks and rounds away from free. The quarter
  // floor is what the cooldown upgrade carried before it became data.
  fireCooldownTicks: { min: 1, minShareOfBase: 0.25, round: "ceil" },
  mgFireCooldownTicks: { min: 1, minShareOfBase: 0.25, round: "ceil" },
  shieldEngageTicks: { min: 0, round: "ceil" },
  shieldMinimumUpTicks: { min: 0, round: "ceil" },
  shieldCooldownTicks: { min: 0, round: "ceil" },
  // Wider than a full circle blocks more than the display can draw. The clamp
  // used to live in the projection alone, so the shield quietly intercepted
  // shots it never showed.
  shieldArcRadians: { min: 0, max: Math.PI * 2 },
  // Reverse is a share of forward speed; above parity it stops being reverse.
  spaceshipReverseSpeedFactor: { min: 0, max: 1 }
};

export function shipStatsFromConfig(source: ShipStats): ShipStats {
  const stats = {} as Record<ShipStatField, number>;
  for (const field of SHIP_STAT_FIELDS) stats[field] = source[field];
  return stats;
}

/**
 * Ship stats from the run's base and everything bought so far.
 *
 * Always from the base, never from the previous result: within one class the
 * operations commute, so the crew's purchase order cannot change the ship, and
 * a replay or a reconnect rebuilds the same numbers by construction.
 */
export function computeShipStats(base: ShipStats, effects: readonly ShipStatEffect[]): ShipStats {
  const added = new Map<ShipStatField, number>();
  const percent = new Map<ShipStatField, number>();
  const multiplied = new Map<ShipStatField, number>();
  for (const effect of effects) {
    if (effect.op === "add")
      added.set(effect.target, (added.get(effect.target) ?? 0) + effect.value);
    else if (effect.op === "percent")
      percent.set(effect.target, (percent.get(effect.target) ?? 0) + effect.value);
    else multiplied.set(effect.target, (multiplied.get(effect.target) ?? 1) * effect.value);
  }

  const stats = {} as Record<ShipStatField, number>;
  for (const field of SHIP_STAT_FIELDS) {
    const baseValue = base[field];
    const raw =
      (baseValue + (added.get(field) ?? 0)) *
      (1 + (percent.get(field) ?? 0)) *
      (multiplied.get(field) ?? 1);
    stats[field] = applyRule(field, baseValue, raw);
  }
  return stats;
}

function applyRule(field: ShipStatField, base: number, raw: number): number {
  const rule = SHIP_STAT_RULES[field];
  if (rule === undefined) return Math.max(0, raw);
  let value = raw;
  if (rule.minShareOfBase !== undefined) value = Math.max(base * rule.minShareOfBase, value);
  if (rule.round === "ceil") value = Math.ceil(value);
  value = Math.max(rule.min ?? 0, value);
  return rule.max === undefined ? value : Math.min(rule.max, value);
}
