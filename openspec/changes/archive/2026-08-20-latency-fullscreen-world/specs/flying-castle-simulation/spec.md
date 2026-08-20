## MODIFIED Requirements

### Requirement: Симуляция создаёт явный мир летающего замка

Game-core SHALL создавать детерминированное состояние из явного config. Config SHALL содержать
fixedStepMs=50, world `4800×3200`, castle radius/max speed, acceleration 640 units/s², braking 800
units/s², input timeout 250 ms, projectile speed/lifetime, fire cooldown 250 ms, shield capacity
100, drain 20 units/s и recharge 10 units/s. State SHALL содержать clock, castle position/velocity,
turret angle, queued gunner fire edge, shield angle/active/energy/rearm latch, latest role inputs и
projectiles. Дополнительно config SHALL содержать turret max angular speed `13π/30 rad/s`,
acceleration `13π/15 rad/s²` и braking `13π/10 rad/s²`, shield max angular speed `13π/24 rad/s`,
acceleration `13π/12 rad/s²` и braking `13π/8 rad/s²`; state SHALL хранить current angle, nullable
target angle и signed angular velocity отдельно для turret и shield. Target/velocity SHALL
оставаться внутренними trusted полями и SHALL NOT публиковаться transport-клиентам.

#### Scenario: Одинаковое начальное состояние

- **WHEN** ядро дважды получает одинаковый config
- **THEN** оно создаёт структурно одинаковый мир размером `4800×3200`, с castle в центре
  `(2400,1600)`, current angle 0, target `null` и angular velocity 0 без DOM, сети, wall clock или
  несеянной случайности

#### Scenario: Некорректная конфигурация

- **WHEN** размеры, fixed step, linear/angular speed, acceleration, braking, timeout, cooldown,
  lifetime либо shield capacity/rates неположительны или не finite
- **THEN** ядро отклоняет config и не возвращает частичное состояние

#### Scenario: Пушка разворачивается на 180 градусов

- **WHEN** turret из покоя получает target на противоположной стороне
- **THEN** он достигает target за 52 fixed steps (2.60 s) без overshoot

#### Scenario: Щит разворачивается на 180 градусов

- **WHEN** shield из покоя получает target на противоположной стороне
- **THEN** он достигает target за 43 fixed steps (2.15 s) без overshoot
