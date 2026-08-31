import {
  type ShipArchetype,
  type ShipModule,
  type ShipStatEffectTuning
} from "@spaceship-defender/protocol";

/**
 * The hulls a run can be played on, and the tree each of them offers.
 *
 * The tree is data, not code: 26 modules over ten tiers per hull is authoring,
 * and it belongs where an operator can edit it. What the code owns is the shape
 * — ten tiers of widths 1, 2, 2, 2, 2, 3, 3, 3, 4, 4, every tier of three or
 * more covering all three seats — and the schema refuses a preset that breaks
 * it, so a tier that leaves the shield operator with nothing to want is caught
 * when the file loads rather than on the seventh wave.
 *
 * Captions are assembled from the effects, so a module carries a name and what
 * it does, never a number written twice.
 */

const add = (target: ShipStatEffectTuning["target"], value: number): ShipStatEffectTuning => ({
  target,
  op: "add",
  value
});
const percent = (target: ShipStatEffectTuning["target"], value: number): ShipStatEffectTuning => ({
  target,
  op: "percent",
  value
});
const multiply = (target: ShipStatEffectTuning["target"], value: number): ShipStatEffectTuning => ({
  target,
  op: "multiply",
  value
});

const DEGREES = Math.PI / 180;

function card(
  id: string,
  role: ShipModule["role"],
  label: string,
  effects: readonly ShipStatEffectTuning[]
): ShipModule {
  return { id, role, label, effects };
}

/**
 * Guardian: the ship the game shipped with. Kinetic turret, machine-gun nose,
 * nothing it is bad at — the hull the other two are measured against, so its
 * overrides are deliberately empty and its tree spreads evenly over the seats.
 */
const GUARDIAN_TIERS: readonly (readonly ShipModule[])[] = [
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
const GUARDIAN_ENDLESS: readonly ShipModule[] = [
  card("endlessHull", "pilot", "Ремонтные накладки", [add("spaceshipMaxHp", 30)]),
  card("endlessDamage", "gunner", "Калибровка орудия", [percent("friendlyProjectileDamage", 0.08)]),
  card("endlessShield", "shield", "Подстройка эмиттера", [add("shieldCapacity", 15)])
];

const GUARDIAN: ShipArchetype = {
  label: "Страж",
  description:
    "Кинетическая турель и носовой пулемёт. Ни в чём не лучший и ни в чём не худший — корпус, по которому меряют остальные.",
  visual: null,
  unlockedAtWave: 1,
  overrides: { stats: {}, cannonWeaponKind: null, mgWeaponKind: null },
  tiers: GUARDIAN_TIERS,
  endlessTier: GUARDIAN_ENDLESS
};

export const DEFAULT_SHIP_ARCHETYPE_ID = "guardian";

export const DEFAULT_SHIP_ARCHETYPES: Readonly<Record<string, ShipArchetype>> = {
  [DEFAULT_SHIP_ARCHETYPE_ID]: GUARDIAN
};
