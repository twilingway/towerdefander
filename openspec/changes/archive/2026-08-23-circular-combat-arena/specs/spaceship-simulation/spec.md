## MODIFIED Requirements

### Requirement: Симуляция создаёт явный мир космического корабля

Game-core SHALL создавать детерминированное состояние из явного config и non-zero uint32 run seed.
Config SHALL содержать fixedStepMs=50, square world `4400×4400`, arenaRadius 2200, spaceship
radius/max speed, acceleration 640 units/s², braking 800 units/s², input timeout 250 ms, projectile
speed/lifetime, fire cooldown 250 ms, shield capacity 100, drain 20 units/s и recharge 10 units/s.
Combat config SHALL содержать positive safe integer ambient asteroid interval min=40/max=100 ticks и
SHALL требовать `min <= max`. State SHALL содержать clock, spaceship position/velocity/current/max
HP, encounter phase/wave/score, independent domain RNG state, monotonic spawn sequence, turret
angle, queued gunner fire edge, shield angle/active/energy/rearm latch, latest role inputs, role
modifiers и combat entities. Дополнительно config SHALL содержать turret max angular speed
`13π/30 rad/s`, acceleration `13π/15 rad/s²` и braking `13π/10 rad/s²`, shield max angular speed
`13π/24 rad/s`, acceleration `13π/12 rad/s²` и braking `13π/8 rad/s²`; state SHALL хранить current
angle, nullable target angle и signed angular velocity отдельно для turret и shield. Angular
target/velocity и RNG state SHALL оставаться внутренними trusted полями и SHALL NOT публиковаться
transport-клиентам.

#### Scenario: Одинаковое начальное состояние

- **WHEN** ядро дважды получает одинаковые config и run seed
- **THEN** оно создаёт структурно одинаковый square world `4400×4400` с arenaRadius 2200, spaceship
  в центре `(2200,2200)`, full HP, wave 1/combat, current angle 0, target `null` и angular velocity
  0 без DOM, сети, wall clock или несеянной случайности

#### Scenario: Некорректная конфигурация

- **WHEN** seed равен нулю, world не square/не равен диаметру arena, ambient interval не positive
  safe integer либо min>max, или прочие fixed-step/rate/cap значения неположительны/non-finite
- **THEN** ядро отклоняет config и не возвращает частичное состояние

#### Scenario: Пушка разворачивается на 180 градусов

- **WHEN** turret из покоя получает target на противоположной стороне
- **THEN** он достигает target за 52 fixed steps (2.60 s) без overshoot

#### Scenario: Щит разворачивается на 180 градусов

- **WHEN** shield из покоя получает target на противоположной стороне
- **THEN** он достигает target за 43 fixed steps (2.15 s) без overshoot

### Requirement: Pilot перемещает корабль фиксированными шагами

Pilot input SHALL быть нормализованным vector `x,y` в диапазоне -1..1. Ядро SHALL ограничивать длину
диагонального vector единицей и SHALL приближать текущую velocity к `vector * maxSpeed` не быстрее
acceleration за fixed step. Для нулевого или stale vector ядро SHALL приближать velocity к нулю не
быстрее braking за fixed step. Position SHALL изменяться по новой velocity. Весь spaceship circle
SHALL оставаться внутри authoritative arena; при достижении окружности SHALL обнуляться только
направленная наружу radial component velocity, а tangent/направленная внутрь SHALL сохраняться.

#### Scenario: WASD направлен вправо

- **WHEN** из покоя pilot удерживает `{x:1,y:0}` десять fixed steps
- **THEN** x-velocity возрастает равными ограниченными шагами и достигает maxSpeed 320 только на
  десятом step

#### Scenario: Мягкая остановка

- **WHEN** корабль движется вправо с maxSpeed и pilot отпускает управление
- **THEN** x-velocity уменьшается до нуля за восемь fixed steps, а position продолжает плавно
  изменяться до полной остановки

#### Scenario: Диагональ не быстрее прямого движения

- **WHEN** pilot отправляет `{x:1,y:1}`
- **THEN** длина target и фактической velocity не превышает настроенную maxSpeed

#### Scenario: Корабль достигает границы

- **WHEN** движение вывело бы spaceship radius за arena circumference
- **THEN** center проецируется на legal radius, outward radial velocity становится нулевой, а
  допустимая tangent velocity сохраняется

### Requirement: Gunner направляет пушку и создаёт снаряды

Свежий ненулевой gunner aim vector SHALL задавать target turret angle; нулевой vector SHALL
сохранять последнее target-направление, по умолчанию current angle вправо. Свежий `firing=true`
SHALL создавать не более одного projectile у края корабля при каждом завершении cooldown. Fixed step
SHALL двигать projectiles и удалять их после lifetime или выхода за circular arena envelope.
Ненулевой aim SHALL NOT мгновенно заменять current turret angle: fixed step SHALL приближать его к
target по кратчайшей дуге с настроенными acceleration, braking и max angular speed; exact antipode
SHALL выбирать положительную дугу π; angle SHALL канонизироваться в `[-π,π)` и SHALL NOT перелетать
target. Projectile SHALL использовать current authoritative turret angle на eligible fire tick, а не
target angle.

#### Scenario: Пушка поворачивается

- **WHEN** turret направлен вправо, gunner задаёт target вверх и выполняется первый fixed step
- **THEN** current turret angle сдвигается вверх, но остаётся между направлением вправо и target и
  не превышает разрешённый angular acceleration step

#### Scenario: Нулевое направление пушки

- **WHEN** gunner после target вверх отправляет нулевой aim до достижения target
- **THEN** target сохраняется и turret продолжает плавный traverse до направления вверх

#### Scenario: Разрешённый выстрел

- **WHEN** cooldown завершён, target ещё не достигнут и latest accepted gunner input содержит
  `firing=true`
- **THEN** появляется один projectile с server identity и velocity по current turret angle этого
  tick, а не по target

#### Scenario: Cooldown ещё активен

- **WHEN** `firing=true` удерживается раньше 250 ms после принятого выстрела
- **THEN** новый projectile не создаётся независимо от продолжающегося traverse

#### Scenario: Поворот через границу углов

- **WHEN** current angle находится около `π`, а target около `-π`
- **THEN** turret выбирает короткую дугу через wrap, а не почти полный оборот

#### Scenario: Цель находится строго сзади

- **WHEN** target отличается от current ровно на π
- **THEN** turret детерминированно начинает положительный экранный clockwise traverse

#### Scenario: Пушка достигает цели без перелёта

- **WHEN** fixed steps выполняются до завершения разворота на 180°
- **THEN** current angle становится равным target, angular velocity становится нулевой и ни один
  snapshot не проходит за target

#### Scenario: Новая цель требует реверса

- **WHEN** turret вращается по положительной дуге и свежий aim задаёт target по противоположной
  стороне
- **THEN** angular velocity сначала изменяется в пределах braking step, не меняет знак мгновенно,
  затем разгоняется к новой цели
