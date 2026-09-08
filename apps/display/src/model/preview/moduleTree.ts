import type { ModuleTreeEntry } from "../../components/ModuleTreeWindow/index.js";

/**
 * The default hull tree: seats, labels and the effects each module applies.
 *
 * A fixture, not a source: the tree itself lives in `game-core` and in the
 * preset, and the display has no way to read either without a server. When the
 * catalogue starts carrying the tree and its effects, this goes and the window
 * reads that instead.
 */
export const PREVIEW_MODULE_TIERS: readonly (readonly ModuleTreeEntry[])[] = [
  [
    {
      id: "hullPlating1",
      role: "pilot",
      label: "Броневые пластины",
      effects: [{ target: "spaceshipMaxHp", op: "add", value: 40 }]
    }
  ],
  [
    {
      id: "thrusters1",
      role: "pilot",
      label: "Маршевые двигатели",
      effects: [
        { target: "spaceshipSpeedPerSecond", op: "percent", value: 0.08 },
        { target: "spaceshipAccelerationPerSecondSquared", op: "percent", value: 0.1 }
      ]
    },
    {
      id: "autoloader1",
      role: "gunner",
      label: "Автомат заряжания",
      effects: [{ target: "fireCooldownTicks", op: "multiply", value: 0.9 }]
    }
  ],
  [
    {
      id: "ammoFeed1",
      role: "gunner",
      label: "Усиленный боекомплект",
      effects: [{ target: "friendlyProjectileDamage", op: "percent", value: 0.12 }]
    },
    {
      id: "capacitor1",
      role: "shield",
      label: "Конденсатор",
      effects: [{ target: "shieldCapacity", op: "add", value: 25 }]
    }
  ],
  [
    {
      id: "gyroscopes1",
      role: "pilot",
      label: "Гироскопы",
      effects: [
        { target: "headingMaxAngularSpeedPerSecond", op: "percent", value: 0.15 },
        { target: "headingAngularAccelerationPerSecondSquared", op: "percent", value: 0.15 }
      ]
    },
    {
      id: "emitterCoils1",
      role: "shield",
      label: "Катушки эмиттера",
      effects: [{ target: "shieldRechargePerSecond", op: "percent", value: 0.18 }]
    }
  ],
  [
    {
      id: "noseCooling1",
      role: "pilot",
      label: "Обдув носового ствола",
      effects: [{ target: "mgCoolingPerSecond", op: "percent", value: 0.25 }]
    },
    {
      id: "barrelCooling1",
      role: "gunner",
      label: "Охлаждение пушки",
      effects: [{ target: "cannonCoolingPerSecond", op: "percent", value: 0.25 }]
    }
  ],
  [
    {
      id: "hullPlating2",
      role: "pilot",
      label: "Композитный корпус",
      effects: [{ target: "spaceshipMaxHp", op: "add", value: 60 }]
    },
    {
      id: "heavyRounds",
      role: "gunner",
      label: "Тяжёлые снаряды",
      effects: [
        { target: "friendlyProjectileDamage", op: "percent", value: 0.18 },
        { target: "projectileSpeedPerSecond", op: "percent", value: -0.05 }
      ]
    },
    {
      id: "wideArc",
      role: "shield",
      label: "Широкий сектор",
      effects: [{ target: "shieldArcRadians", op: "add", value: (20 * Math.PI) / 180 }]
    }
  ],
  [
    {
      id: "afterburner",
      role: "pilot",
      label: "Форсаж",
      effects: [
        { target: "spaceshipSpeedPerSecond", op: "percent", value: 0.14 },
        { target: "spaceshipAccelerationPerSecondSquared", op: "percent", value: 0.18 }
      ]
    },
    {
      id: "turretDrive",
      role: "gunner",
      label: "Привод башни",
      effects: [
        { target: "turretMaxAngularSpeedPerSecond", op: "percent", value: 0.25 },
        { target: "turretAngularAccelerationPerSecondSquared", op: "percent", value: 0.25 }
      ]
    },
    {
      id: "capacitor2",
      role: "shield",
      label: "Батарея повышенной ёмкости",
      effects: [{ target: "shieldCapacity", op: "add", value: 40 }]
    }
  ],
  [
    {
      id: "beltFeed",
      role: "pilot",
      label: "Ленточная подача",
      effects: [{ target: "mgFireCooldownTicks", op: "multiply", value: 0.85 }]
    },
    {
      id: "highVelocity",
      role: "gunner",
      label: "Высокая начальная скорость",
      effects: [
        { target: "projectileSpeedPerSecond", op: "percent", value: 0.2 },
        { target: "projectileRadius", op: "percent", value: 0.1 }
      ]
    },
    {
      id: "fastEngage",
      role: "shield",
      label: "Быстрый подъём",
      effects: [
        { target: "shieldEngageTicks", op: "multiply", value: 0.6 },
        { target: "shieldCooldownTicks", op: "multiply", value: 0.7 }
      ]
    }
  ],
  [
    {
      id: "hullPlating3",
      role: "pilot",
      label: "Реактивная броня",
      effects: [{ target: "spaceshipMaxHp", op: "add", value: 90 }]
    },
    {
      id: "noseCalibre",
      role: "pilot",
      label: "Крупный калибр носа",
      effects: [{ target: "mgDamage", op: "percent", value: 0.3 }]
    },
    {
      id: "cannonCalibre",
      role: "gunner",
      label: "Крупный калибр",
      effects: [{ target: "friendlyProjectileDamage", op: "percent", value: 0.25 }]
    },
    {
      id: "drainControl",
      role: "shield",
      label: "Контроль расхода",
      effects: [{ target: "shieldDrainPerSecond", op: "multiply", value: 0.75 }]
    }
  ],
  [
    {
      id: "reactorOverdrive",
      role: "pilot",
      label: "Разгон реактора",
      effects: [
        { target: "spaceshipSpeedPerSecond", op: "percent", value: 0.18 },
        { target: "spaceshipAccelerationPerSecondSquared", op: "percent", value: 0.2 }
      ]
    },
    {
      id: "rapidFire",
      role: "gunner",
      label: "Скорострельность",
      effects: [{ target: "fireCooldownTicks", op: "multiply", value: 0.75 }]
    },
    {
      id: "heatSink",
      role: "gunner",
      label: "Радиатор",
      effects: [
        { target: "cannonHeatCapacity", op: "percent", value: 0.4 },
        { target: "cannonHeatPerShot", op: "multiply", value: 0.85 }
      ]
    },
    {
      id: "fullDome",
      role: "shield",
      label: "Полный купол",
      effects: [
        { target: "shieldArcRadians", op: "add", value: (40 * Math.PI) / 180 },
        { target: "shieldRechargePerSecond", op: "percent", value: 0.2 }
      ]
    }
  ]
];

export const PREVIEW_ENDLESS_TIER: readonly ModuleTreeEntry[] = [
  {
    id: "endlessHull",
    role: "pilot",
    label: "Ремонтные накладки",
    effects: [{ target: "spaceshipMaxHp", op: "add", value: 30 }]
  },
  {
    id: "endlessDamage",
    role: "gunner",
    label: "Калибровка орудия",
    effects: [{ target: "friendlyProjectileDamage", op: "percent", value: 0.08 }]
  },
  {
    id: "endlessShield",
    role: "shield",
    label: "Подстройка эмиттера",
    effects: [{ target: "shieldCapacity", op: "add", value: 15 }]
  }
];
