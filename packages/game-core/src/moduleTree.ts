import type { GameplayRole, ShipModuleDefinition } from "./combatTypes.ts";
import type { ModuleTargetField, ShipStatEffect } from "./shipStats.ts";

/**
 * The tree the base hull offers, and the default every preset starts from.
 *
 * A tree is data, not code: 26 modules over ten tiers is authoring, and the
 * preset owns it so an operator can edit it. What the code owns is the shape —
 * ten tiers of widths 1, 2, 2, 2, 2, 3, 3, 3, 4, 4, every tier of three or more
 * covering all three seats — and the balance schema refuses a preset that
 * breaks it, so a tier that leaves the shield operator with nothing to want is
 * caught when the file loads rather than on the seventh wave.
 *
 * A module carries a name and what it does. The caption clients show is
 * assembled from the effects, so the number is never written twice.
 */

const add = (target: ModuleTargetField, value: number): ShipStatEffect => ({
  target,
  op: "add",
  value
});
const percent = (target: ModuleTargetField, value: number): ShipStatEffect => ({
  target,
  op: "percent",
  value
});
const multiply = (target: ModuleTargetField, value: number): ShipStatEffect => ({
  target,
  op: "multiply",
  value
});

const DEGREES = Math.PI / 180;

function card(
  id: string,
  role: GameplayRole,
  label: string,
  effects: readonly ShipStatEffect[]
): ShipModuleDefinition {
  return { id, role, label, effects };
}

/**
 * Guardian: the ship the game shipped with. Kinetic turret, machine-gun nose,
 * nothing it is bad at — the hull the other two are measured against, so its
 * overrides are deliberately empty and its tree spreads evenly over the seats.
 */
const GUARDIAN_TIERS: readonly (readonly ShipModuleDefinition[])[] = [
  [card("hullPlating1", "pilot", "Броневые пластины", [add("spaceshipMaxHp", 40)])],
  [
    card("thrusters1", "pilot", "Маршевые двигатели", [
      percent("spaceshipSpeedPerSecond", 0.08),
      percent("spaceshipAccelerationPerSecondSquared", 0.1)
    ]),
    card("autoloader1", "gunner", "Автомат заряжания", [multiply("fireCooldownTicks", 0.9)])
  ],
  [
    card("ammoFeed1", "gunner", "Усиленный боекомплект", [
      percent("friendlyProjectileDamage", 0.12)
    ]),
    card("capacitor1", "shield", "Конденсатор", [add("shieldCapacity", 25)])
  ],
  [
    card("gyroscopes1", "pilot", "Гироскопы", [
      percent("headingMaxAngularSpeedPerSecond", 0.15),
      percent("headingAngularAccelerationPerSecondSquared", 0.15)
    ]),
    card("emitterCoils1", "shield", "Катушки эмиттера", [percent("shieldRechargePerSecond", 0.18)])
  ],
  [
    card("noseCooling1", "pilot", "Обдув носового ствола", [percent("mgCoolingPerSecond", 0.25)]),
    card("barrelCooling1", "gunner", "Охлаждение пушки", [percent("cannonCoolingPerSecond", 0.25)])
  ],
  [
    card("hullPlating2", "pilot", "Композитный корпус", [add("spaceshipMaxHp", 60)]),
    // The slower shell is the price of the heavier one: a trade, not a step up.
    card("heavyRounds", "gunner", "Тяжёлые снаряды", [
      percent("friendlyProjectileDamage", 0.18),
      percent("projectileSpeedPerSecond", -0.05)
    ]),
    card("wideArc", "shield", "Широкий сектор", [add("shieldArcRadians", 20 * DEGREES)])
  ],
  [
    card("afterburner", "pilot", "Форсаж", [
      percent("spaceshipSpeedPerSecond", 0.14),
      percent("spaceshipAccelerationPerSecondSquared", 0.18)
    ]),
    card("turretDrive", "gunner", "Привод башни", [
      percent("turretMaxAngularSpeedPerSecond", 0.25),
      percent("turretAngularAccelerationPerSecondSquared", 0.25)
    ]),
    card("capacitor2", "shield", "Батарея повышенной ёмкости", [add("shieldCapacity", 40)])
  ],
  [
    card("beltFeed", "pilot", "Ленточная подача", [multiply("mgFireCooldownTicks", 0.85)]),
    card("highVelocity", "gunner", "Высокая начальная скорость", [
      percent("projectileSpeedPerSecond", 0.2),
      percent("projectileRadius", 0.1)
    ]),
    card("fastEngage", "shield", "Быстрый подъём", [
      multiply("shieldEngageTicks", 0.6),
      multiply("shieldCooldownTicks", 0.7)
    ])
  ],
  [
    card("hullPlating3", "pilot", "Реактивная броня", [add("spaceshipMaxHp", 90)]),
    card("noseCalibre", "pilot", "Крупный калибр носа", [percent("mgDamage", 0.3)]),
    card("cannonCalibre", "gunner", "Крупный калибр", [percent("friendlyProjectileDamage", 0.25)]),
    card("drainControl", "shield", "Контроль расхода", [multiply("shieldDrainPerSecond", 0.75)])
  ],
  [
    card("reactorOverdrive", "pilot", "Разгон реактора", [
      percent("spaceshipSpeedPerSecond", 0.18),
      percent("spaceshipAccelerationPerSecondSquared", 0.2)
    ]),
    card("rapidFire", "gunner", "Скорострельность", [multiply("fireCooldownTicks", 0.75)]),
    card("heatSink", "gunner", "Радиатор", [
      percent("cannonHeatCapacity", 0.4),
      multiply("cannonHeatPerShot", 0.85)
    ]),
    card("fullDome", "shield", "Полный купол", [
      add("shieldArcRadians", 40 * DEGREES),
      percent("shieldRechargePerSecond", 0.2)
    ])
  ]
];

/**
 * What a crew that bought the whole tree keeps buying. Additions and percents
 * only: a multiplier bought ten times compounds into a different game, and the
 * point of the tail is that credits stay worth earning, not that wave thirty
 * plays by other rules.
 */
const GUARDIAN_ENDLESS: readonly ShipModuleDefinition[] = [
  card("endlessHull", "pilot", "Ремонтные накладки", [add("spaceshipMaxHp", 30)]),
  card("endlessDamage", "gunner", "Калибровка орудия", [percent("friendlyProjectileDamage", 0.08)]),
  card("endlessShield", "shield", "Подстройка эмиттера", [add("shieldCapacity", 15)])
];

/** The ten tiers the base hull offers, and the tail that follows them. */
export const DEFAULT_MODULE_TIERS = GUARDIAN_TIERS;
export const DEFAULT_ENDLESS_TIER = GUARDIAN_ENDLESS;
