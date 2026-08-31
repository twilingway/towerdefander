import type { ShipArchetype, ShipModule } from "@spaceship-defender/protocol";
import {
  DEFAULT_ENDLESS_TIER,
  DEFAULT_MODULE_TIERS,
  type ShipModuleDefinition
} from "@spaceship-defender/game-core";

/**
 * The hull catalogue a fresh preset starts from.
 *
 * The tree itself lives in `game-core` beside the stat engine that applies it,
 * because the simulation needs a default tree with or without a preset. What a
 * preset adds on top is the hull: a name, a look, and the sparse diff that
 * makes one ship fly differently from another. The base hull's diff is empty on
 * purpose — a run on it is the run the game had before hulls existed.
 */

const toModule = (module: ShipModuleDefinition): ShipModule => ({
  id: module.id,
  label: module.label,
  role: module.role,
  effects: module.effects.map(({ target, op, value }) => ({ target, op, value }))
});

const GUARDIAN: ShipArchetype = {
  label: "Страж",
  description:
    "Кинетическая турель и носовой пулемёт. Ни в чём не лучший и ни в чём не худший — корпус, по которому меряют остальные.",
  visual: null,
  unlockedAtWave: 1,
  overrides: { stats: {}, cannonWeaponKind: null, mgWeaponKind: null },
  tiers: DEFAULT_MODULE_TIERS.map((tier) => tier.map(toModule)),
  endlessTier: DEFAULT_ENDLESS_TIER.map(toModule)
};

const DEGREES = Math.PI / 180;

/**
 * What a hull swaps out of the shared tree, keyed by the module it replaces.
 *
 * Written as a delta rather than as a third and fourth hand-authored tree: the
 * shape and the seats are the same everywhere, and stating only the differences
 * is what makes the identity of a hull readable. A module that means nothing on
 * this hull -- a shell's muzzle velocity on a laser -- is the one that gets
 * swapped; the rest carry over unchanged.
 */
type TreeDelta = Readonly<Record<string, ShipModule>>;

function withDelta(
  hullId: string,
  delta: TreeDelta
): {
  readonly tiers: readonly (readonly ShipModule[])[];
  readonly endlessTier: readonly ShipModule[];
} {
  const swap = (module: ShipModule): ShipModule => ({
    ...(delta[module.id] ?? module),
    // Ids stay unique across the catalogue, and a hull's own prefix is what
    // lets a batch report say which hull a build came from.
    id: `${hullId}-${delta[module.id]?.id ?? module.id}`
  });
  return {
    tiers: GUARDIAN.tiers.map((tier) => tier.map(swap)),
    endlessTier: GUARDIAN.endlessTier.map(swap)
  };
}

const module = (
  id: string,
  role: ShipModule["role"],
  label: string,
  effects: readonly ShipModule["effects"][number][]
): ShipModule => ({ id, role, label, effects });

/**
 * Blade: a laser on both barrels, and a hull that has to be where the beam
 * reaches. Fast, fragile, narrow shield. Its tree drops everything about shell
 * flight -- a beam has none -- and buys reach and heat instead.
 */
const BLADE_DELTA: TreeDelta = {
  heavyRounds: module("focusedBeam", "gunner", "Сфокусированный луч", [
    { target: "friendlyProjectileDamage", op: "percent", value: 0.18 },
    { target: "cannonHeatPerShot", op: "percent", value: 0.08 }
  ]),
  highVelocity: module("longOptics", "gunner", "Дальняя оптика", [
    { target: "cannonLaserRange", op: "percent", value: 0.25 }
  ]),
  cannonCalibre: module("beamDensity", "gunner", "Плотность луча", [
    { target: "friendlyProjectileDamage", op: "percent", value: 0.25 }
  ]),
  noseCalibre: module("noseOptics", "pilot", "Носовая оптика", [
    { target: "mgLaserRange", op: "percent", value: 0.3 },
    { target: "laserBeamRadius", op: "percent", value: 0.15 }
  ])
};

const BLADE: ShipArchetype = {
  label: "Клинок",
  description:
    "Лазер в обоих стволах: не мажет, но не достаёт далеко. Быстрый и хрупкий — награждает того, кто подошёл и не стоит на месте.",
  visual: null,
  unlockedAtWave: 15,
  overrides: {
    stats: {
      // Fragility is priced in damage, not in speed. Measured: the stat block
      // alone costs four waves on the stand, and the speed buys none of them
      // back, because the demo bot holds the distance its autopilot profile
      // says rather than the one the hull wants. So the Blade pays for thin
      // armour with a barrel that hurts: damage x1.4 and a shorter cooldown put
      // it level with the Guardian in median and within half a wave in mean.
      spaceshipMaxHp: 400,
      spaceshipRadius: 44,
      shieldRadius: 92,
      spaceshipSpeedPerSecond: 420,
      spaceshipAccelerationPerSecondSquared: 900,
      shieldCapacity: 85,
      shieldArcRadians: 75 * DEGREES,
      friendlyProjectileDamage: 35,
      mgDamage: 11,
      fireCooldownTicks: 4
    },
    cannonWeaponKind: "laser",
    mgWeaponKind: "laser"
  },
  ...withDelta("blade", BLADE_DELTA)
};

/**
 * Bastion: missiles that chase on their own, on a hull too slow to chase
 * anything itself. Its tree buys the missile's patience -- how hard it turns
 * and how wide it looks -- instead of the muzzle velocity it does not have.
 */
const BASTION_DELTA: TreeDelta = {
  heavyRounds: module("heavyWarhead", "gunner", "Тяжёлая боевая часть", [
    { target: "friendlyProjectileDamage", op: "percent", value: 0.22 },
    { target: "friendlyMissileTurnRatePerSecond", op: "percent", value: -0.08 }
  ]),
  highVelocity: module("seekerHead", "gunner", "Головка самонаведения", [
    { target: "friendlyMissileTurnRatePerSecond", op: "percent", value: 0.25 },
    { target: "friendlyMissileAcquireConeRadians", op: "percent", value: 0.2 }
  ]),
  noseCalibre: module("noseSeeker", "pilot", "Носовая головка", [
    { target: "friendlyMissileAcquireConeRadians", op: "percent", value: 0.3 }
  ])
};

const BASTION: ShipArchetype = {
  label: "Бастион",
  description:
    "Ракеты догоняют сами, поэтому корпусу не нужно спешить. Медленный, но толстый, с широким щитом — держит там, где остальные отходят.",
  visual: null,
  unlockedAtWave: 20,
  overrides: {
    stats: {
      spaceshipMaxHp: 720,
      spaceshipRadius: 62,
      shieldRadius: 124,
      spaceshipSpeedPerSecond: 240,
      spaceshipAccelerationPerSecondSquared: 420,
      headingMaxAngularSpeedPerSecond: Math.PI * 0.7,
      shieldCapacity: 160,
      shieldArcRadians: 130 * DEGREES,
      // Toughness is what a stand-off fighter converts into waves best, so the
      // Bastion pays for it in cadence: a launcher that takes its time.
      fireCooldownTicks: 7
    },
    cannonWeaponKind: "missile",
    mgWeaponKind: "missile"
  },
  ...withDelta("bastion", BASTION_DELTA)
};

export const DEFAULT_SHIP_ARCHETYPE_ID = "guardian";

export const DEFAULT_SHIP_ARCHETYPES: Readonly<Record<string, ShipArchetype>> = {
  [DEFAULT_SHIP_ARCHETYPE_ID]: GUARDIAN,
  blade: BLADE,
  bastion: BASTION
};
