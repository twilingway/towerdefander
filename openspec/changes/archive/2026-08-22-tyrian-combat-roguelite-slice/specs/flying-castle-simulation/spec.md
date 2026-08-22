## MODIFIED Requirements

### Requirement: Симуляция создаёт явный мир летающего замка

Game-core SHALL создавать детерминированное состояние из явного config и non-zero uint32 run seed.
Config SHALL содержать fixedStepMs=50, world `4800×3200`, castle radius/max speed, acceleration 640
units/s², braking 800 units/s², input timeout 250 ms, projectile speed/lifetime, fire cooldown 250
ms, shield capacity 100, drain 20 units/s и recharge 10 units/s. State SHALL содержать clock, castle
position/velocity/current/max HP, encounter phase/wave/score, independent domain RNG state,
monotonic spawn sequence, turret angle, queued gunner fire edge, shield angle/active/energy/rearm
latch, latest role inputs, role modifiers и combat entities. Дополнительно config SHALL содержать
turret max angular speed `13π/30 rad/s`, acceleration `13π/15 rad/s²` и braking `13π/10 rad/s²`,
shield max angular speed `13π/24 rad/s`, acceleration `13π/12 rad/s²` и braking `13π/8 rad/s²`;
state SHALL хранить current angle, nullable target angle и signed angular velocity отдельно для
turret и shield. Angular target/velocity и RNG state SHALL оставаться внутренними trusted полями и
SHALL NOT публиковаться transport-клиентам.

#### Scenario: Одинаковое начальное состояние

- **WHEN** ядро дважды получает одинаковые config и run seed
- **THEN** оно создаёт структурно одинаковый мир размером `4800×3200`, с castle в центре
  `(2400,1600)`, full HP, wave 1/combat, current angle 0, target `null` и angular velocity 0 без
  DOM, сети, wall clock или несеянной случайности

#### Scenario: Некорректная конфигурация

- **WHEN** seed равен нулю либо размеры, fixed step, linear/angular speed, acceleration, braking,
  timeout, cooldown, lifetime, HP, combat caps либо shield capacity/rates неположительны/non-finite
- **THEN** ядро отклоняет config и не возвращает частичное состояние

#### Scenario: Пушка разворачивается на 180 градусов

- **WHEN** turret из покоя получает target на противоположной стороне
- **THEN** он достигает target за 52 fixed steps (2.60 s) без overshoot

#### Scenario: Щит разворачивается на 180 градусов

- **WHEN** shield из покоя получает target на противоположной стороне
- **THEN** он достигает target за 43 fixed steps (2.15 s) без overshoot

## ADDED Requirements

### Requirement: Flying-castle state включает здоровье и seeded combat

Protocol-v8 core config SHALL добавлять validated castle max HP, combat tuning, entity caps и run
seed, не меняя fixedStepMs=50 и существующую movement/aim/shield authority. State SHALL публиковать
current/max HP, encounter phase, wave/score и applied role modifiers. HP, damage, RNG state, offers
и combat entities SHALL изменяться только pure core transitions.

#### Scenario: Combat run начинается

- **WHEN** три ready role запускают room с valid config и run seed
- **THEN** castle находится в центре прежнего мира с full HP, wave 1/combat, исходными modifiers и
  deterministic spawn plan

#### Scenario: Pilot получил handling upgrade

- **WHEN** accepted pilot modifier вступает в силу в следующей wave
- **THEN** target max speed/acceleration используют upgraded values, сохраняя normalization, braking
  и world-bound invariants

#### Scenario: Max HP увеличен

- **WHEN** pilot выбирает max-HP/repair offer
- **THEN** max HP возрастает на configured amount, current HP ремонтируется не выше нового max HP и
  display/controllers получают одинаковые значения
