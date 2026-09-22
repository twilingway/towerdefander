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
 * What a hull swaps out of the base tree, keyed by the module it replaces.
 *
 * A delta rather than a third and fourth hand-authored tree, because the code
 * owns the shape and the schema owns the seats: ten tiers of fixed width, a
 * pair of tiers covering two different seats, a wide tier covering all three.
 * Writing the trees out in full would repeat that skeleton three times and
 * invite it to drift; the delta cannot drift, because it can only ever replace
 * a card in the slot it already stands in.
 *
 * The deltas are large. A hull's identity is not one gunner card - it is what
 * every tier offers, and which seat gets the free fourth card in tiers nine and
 * ten. What carries over unchanged is what genuinely means the same on every
 * hull.
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
 * reaches. It buys none of the shell flight it does not have and none of the
 * armour it will never have enough of; it buys arriving, staying pointed, and
 * being able to keep firing. Both free cards - tier nine and tier ten - go to
 * the seats that decide whether a beam hull works at all: the helm and the gun.
 */
const BLADE_DELTA: TreeDelta = {
  // The first card is the only one with no alternative, so it states the hull -
  // but stating it by handing four hundred points of armour nothing at all was
  // measured at zero runs of fifteen reaching wave thirty. It carries plating
  // too; what makes it a Blade card is that the plating comes with thrust.
  hullPlating1: module("lightFrame", "pilot", "Лёгкий каркас", [
    { target: "spaceshipMaxHp", op: "add", value: 30 },
    { target: "spaceshipSpeedPerSecond", op: "percent", value: 0.1 },
    { target: "spaceshipAccelerationPerSecondSquared", op: "percent", value: 0.12 }
  ]),
  thrusters1: module("vectorNozzles", "pilot", "Векторные сопла", [
    { target: "headingMaxAngularSpeedPerSecond", op: "percent", value: 0.18 },
    { target: "headingAngularAccelerationPerSecondSquared", op: "percent", value: 0.18 }
  ]),
  // On a beam hull the radiator is the cadence: it fires until it is hot.
  autoloader1: module("pulseCapacitor", "gunner", "Импульсный конденсатор", [
    { target: "cannonHeatCapacity", op: "percent", value: 0.25 }
  ]),
  ammoFeed1: module("beamFocus", "gunner", "Фокусировка луча", [
    { target: "friendlyProjectileDamage", op: "percent", value: 0.12 }
  ]),
  // A thin shield is worth having up often rather than for long, so the early
  // shield card buys the raising rather than the battery.
  capacitor1: module("quickEmitter", "shield", "Скорый эмиттер", [
    { target: "shieldEngageTicks", op: "multiply", value: 0.7 }
  ]),
  gyroscopes1: module("inertialDamper", "pilot", "Инерционный демпфер", [
    { target: "spaceshipBrakingPerSecondSquared", op: "percent", value: 0.25 }
  ]),
  noseCooling1: module("noseBlower", "pilot", "Обдув носового излучателя", [
    { target: "mgCoolingPerSecond", op: "percent", value: 0.25 }
  ]),
  barrelCooling1: module("emitterCooling", "gunner", "Охлаждение излучателя", [
    { target: "cannonCoolingPerSecond", op: "percent", value: 0.25 }
  ]),
  hullPlating2: module("compositeRibs", "pilot", "Композитные рёбра", [
    { target: "spaceshipMaxHp", op: "add", value: 65 }
  ]),
  heavyRounds: module("focusedBeam", "gunner", "Сфокусированный луч", [
    { target: "friendlyProjectileDamage", op: "percent", value: 0.18 }
  ]),
  noseRadiator: module("noseOptics", "pilot", "Носовая оптика", [
    { target: "mgLaserRange", op: "percent", value: 0.3 },
    { target: "laserBeamRadius", op: "percent", value: 0.15 }
  ]),
  highVelocity: module("longOptics", "gunner", "Дальняя оптика", [
    { target: "cannonLaserRange", op: "percent", value: 0.25 }
  ]),
  hullPlating3: module("ablativePlates", "pilot", "Абляционные щитки", [
    { target: "spaceshipMaxHp", op: "add", value: 95 }
  ]),
  // The free card of tier nine: speed, because on this hull the distance not
  // crossed is the damage not dealt.
  noseCalibre: module("boostLoop", "pilot", "Разгонный контур", [
    { target: "spaceshipSpeedPerSecond", op: "percent", value: 0.16 }
  ]),
  cannonCalibre: module("beamDensity", "gunner", "Плотность луча", [
    { target: "friendlyProjectileDamage", op: "percent", value: 0.25 }
  ]),
  // The free card of tier ten: heat, which is how long a beam hull is allowed
  // to be a beam hull.
  heatSink: module("cryoLoop", "gunner", "Криоконтур", [
    { target: "cannonHeatCapacity", op: "percent", value: 0.4 },
    { target: "cannonHeatPerShot", op: "multiply", value: 0.85 }
  ]),
  endlessHull: module("endlessThrust", "pilot", "Подстройка тяги", [
    { target: "spaceshipSpeedPerSecond", op: "percent", value: 0.05 },
    { target: "spaceshipMaxHp", op: "add", value: 35 }
  ]),
  endlessDamage: module("endlessBeam", "gunner", "Калибровка луча", [
    { target: "friendlyProjectileDamage", op: "percent", value: 0.12 }
  ]),
  endlessShield: module("endlessEmitter", "shield", "Подстройка эмиттера", [
    { target: "shieldCapacity", op: "add", value: 25 }
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
 * anything itself. It buys the two things a stand-off fighter converts into
 * waves - the arc it hides behind and the patience of the missile - and both
 * free cards, tier nine and tier ten, go to the shield, because that is the
 * seat this hull is built around.
 */
const BASTION_DELTA: TreeDelta = {
  hullPlating1: module("bulkPlating", "pilot", "Толстые плиты", [
    { target: "spaceshipMaxHp", op: "add", value: 55 }
  ]),
  // The early pair trades the helm for the battery: this hull is not going
  // anywhere fast, and the shield is what it lives behind.
  thrusters1: module("reserveCells", "shield", "Резервные ячейки", [
    { target: "shieldCapacity", op: "add", value: 30 }
  ]),
  ammoFeed1: module("heavyWarhead", "gunner", "Тяжёлая боевая часть", [
    { target: "friendlyProjectileDamage", op: "percent", value: 0.14 }
  ]),
  gyroscopes1: module("mountGyros", "pilot", "Гироскопы установки", [
    { target: "headingMaxAngularSpeedPerSecond", op: "percent", value: 0.15 }
  ]),
  noseCooling1: module("launcherCooling", "gunner", "Охлаждение пусковой", [
    { target: "cannonCoolingPerSecond", op: "percent", value: 0.25 }
  ]),
  barrelCooling1: module("emitterPriming", "shield", "Разогрев эмиттера", [
    { target: "shieldEngageTicks", op: "multiply", value: 0.7 }
  ]),
  hullPlating2: module("armourBelt", "pilot", "Броневой пояс", [
    { target: "spaceshipMaxHp", op: "add", value: 80 }
  ]),
  heavyRounds: module("seekerHead", "gunner", "Головка самонаведения", [
    { target: "friendlyMissileTurnRatePerSecond", op: "percent", value: 0.25 },
    { target: "friendlyMissileAcquireConeRadians", op: "percent", value: 0.2 }
  ]),
  wideArc: module("wideSector", "shield", "Широкий сектор", [
    { target: "shieldArcRadians", op: "add", value: 25 * DEGREES }
  ]),
  afterburner: module("haulThrusters", "pilot", "Тяговые двигатели", [
    { target: "spaceshipSpeedPerSecond", op: "percent", value: 0.1 },
    { target: "spaceshipAccelerationPerSecondSquared", op: "percent", value: 0.12 }
  ]),
  capacitor2: module("deepCells", "shield", "Глубокая батарея", [
    { target: "shieldCapacity", op: "add", value: 50 }
  ]),
  noseRadiator: module("noseSeeker", "pilot", "Носовая головка", [
    { target: "friendlyMissileAcquireConeRadians", op: "percent", value: 0.3 }
  ]),
  highVelocity: module("longBurn", "gunner", "Долгий разгон", [
    { target: "projectileLifetimeMs", op: "percent", value: 0.2 }
  ]),
  hullPlating3: module("reactiveBelt", "pilot", "Реактивная броня", [
    { target: "spaceshipMaxHp", op: "add", value: 110 }
  ]),
  // The free card of tier nine goes to the shield: a sector that can be brought
  // round is worth more to this hull than a heavier nose.
  noseCalibre: module("sectorDrive", "shield", "Привод сектора", [
    { target: "shieldMaxAngularSpeedPerSecond", op: "percent", value: 0.25 },
    { target: "shieldAngularAccelerationPerSecondSquared", op: "percent", value: 0.25 }
  ]),
  cannonCalibre: module("heavyCharge", "gunner", "Тяжёлый заряд", [
    { target: "friendlyProjectileDamage", op: "percent", value: 0.25 }
  ]),
  // A launcher that starts at nine ticks needs two of them to feel anything.
  rapidFire: module("rapidLaunch", "gunner", "Скорый пуск", [
    { target: "fireCooldownTicks", op: "add", value: -2 }
  ]),
  // And the free card of tier ten: holding the sector up for longer.
  heatSink: module("drainRegulator", "shield", "Регулятор расхода", [
    { target: "shieldDrainPerSecond", op: "multiply", value: 0.8 },
    { target: "shieldRechargePerSecond", op: "percent", value: 0.15 }
  ]),
  endlessHull: module("endlessArmour", "pilot", "Ремонтные накладки", [
    { target: "spaceshipMaxHp", op: "add", value: 70 }
  ]),
  endlessDamage: module("endlessWarhead", "gunner", "Калибровка заряда", [
    { target: "friendlyProjectileDamage", op: "percent", value: 0.1 }
  ]),
  endlessShield: module("endlessCells", "shield", "Подстройка эмиттера", [
    { target: "shieldCapacity", op: "add", value: 35 }
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
