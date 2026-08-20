# flying-castle-simulation Specification

## Purpose

TBD - created by archiving change flying-castle-core. Update Purpose after archive.

## Requirements

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

### Requirement: Pilot перемещает замок фиксированными шагами

Pilot input SHALL быть нормализованным vector `x,y` в диапазоне -1..1. Ядро SHALL ограничивать длину
диагонального vector единицей и SHALL приближать текущую velocity к `vector * maxSpeed` не быстрее
acceleration за fixed step. Для нулевого или stale vector ядро SHALL приближать velocity к нулю не
быстрее braking за fixed step. Position SHALL изменяться по новой velocity. Центр замка и его radius
SHALL оставаться внутри мира; при достижении края SHALL обнуляться только направленная наружу
компонента velocity.

#### Scenario: WASD направлен вправо

- **WHEN** из покоя pilot удерживает `{x:1,y:0}` десять fixed steps
- **THEN** x-velocity возрастает равными ограниченными шагами и достигает maxSpeed 320 только на
  десятом step

#### Scenario: Мягкая остановка

- **WHEN** замок движется вправо с maxSpeed и pilot отпускает управление
- **THEN** x-velocity уменьшается до нуля за восемь fixed steps, а position продолжает плавно
  изменяться до полной остановки

#### Scenario: Диагональ не быстрее прямого движения

- **WHEN** pilot отправляет `{x:1,y:1}`
- **THEN** длина target и фактической velocity не превышает настроенную maxSpeed

#### Scenario: Замок достигает границы

- **WHEN** движение вывело бы castle radius за правый край мира
- **THEN** x прижимается к границе, положительная x-velocity становится нулевой, а допустимая
  y-velocity сохраняется

### Requirement: Gunner направляет пушку и создаёт снаряды

Свежий ненулевой gunner aim vector SHALL задавать target turret angle; нулевой vector SHALL
сохранять последнее target-направление, по умолчанию current angle вправо. Свежий `firing=true`
SHALL создавать не более одного projectile у края замка при каждом завершении cooldown. Fixed step
SHALL двигать projectiles и удалять их после lifetime или выхода за границы мира. Ненулевой aim
SHALL NOT мгновенно заменять current turret angle: fixed step SHALL приближать его к target по
кратчайшей дуге с настроенными acceleration, braking и max angular speed; exact antipode SHALL
выбирать положительную дугу π; angle SHALL канонизироваться в `[-π,π)` и SHALL NOT перелетать
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

### Requirement: Shield operator направляет сектор щита

Свежий ненулевой shield input SHALL задавать target shield angle, а нулевой vector SHALL сохранять
последнее target-направление. Boolean `active` SHALL быть абсолютным устойчивым ON/OFF intent, а не
hold-состоянием. Начальная energy SHALL равняться capacity 100. При фактически активном щите ядро
SHALL уменьшать energy на drain 20 units/s; при выключенном SHALL восстанавливать её на 10 units/s;
energy SHALL оставаться в диапазоне 0..capacity. При достижении нуля shield SHALL автоматически
выключиться и SHALL NOT повторно включаться от heartbeat с прежним `active=true`: требуется accepted
`false`, затем новый `true` при energy>0. Current shield angle SHALL плавно приближаться к target с
acceleration, braking и max speed по shortest-arc/no-overshoot правилам. Traverse SHALL выполняться
независимо от active и energy, поэтому shield можно предварительно направлять во время OFF/recharge.

#### Scenario: Щит удерживается слева

- **WHEN** current shield angle направлен вправо, operator задаёт target слева и включает shield
- **THEN** shield остаётся active и начинает ограниченный traverse влево без мгновенного разворота

#### Scenario: Щит отпущен

- **WHEN** operator отпускает stick после задания target до завершения traverse
- **THEN** shield продолжает поворот к target, а отпускание кнопки не меняет active

#### Scenario: Энергия полностью расходуется

- **WHEN** полный shield остаётся active 100 fixed steps
- **THEN** energy достигает нуля, shield становится inactive и прежний `active=true` heartbeat не
  включает его автоматически

#### Scenario: Энергия восстанавливается

- **WHEN** shield выключен при energy=0 в течение 200 fixed steps
- **THEN** energy становится равной capacity 100 и больше не растёт

#### Scenario: Ручное повторное включение после разряда

- **WHEN** после разряда server принимает `active=false`, energy становится больше нуля, затем
  принимает новый `active=true`
- **THEN** shield снова становится active с текущим плавно достигнутым angle

#### Scenario: Щит направляется в выключенном состоянии

- **WHEN** shield active=false и operator задаёт новый target
- **THEN** current shield angle плавно достигает target, energy продолжает восстанавливаться

### Requirement: Просроченный continuous input безопасно сбрасывается

Ядро SHALL считать pilot/gunner/shield aim свежим пока age меньше 250 ms simulation time. При age

> =250 ms stale pilot target SHALL стать нулевым и запустить обычное торможение, gunner `firing`
> SHALL стать false, а stale shield aim SHALL перестать обновлять направление. Последние
> turret/shield current angles и устойчивое shield active-state SHALL сохраниться; server disconnect
> handling SHALL отдельно выключать shield. Дополнительно stale gunner/shield SHALL отменять только
> angular target и плавно тормозить angular velocity до нуля. Stale SHALL NOT очищать уже accepted
> `queuedFire`; trusted gunner disconnect SHALL по-прежнему очищать queuedFire и angular target.
> Reconnect SHALL начинаться без отменённой angular target.

#### Scenario: Pilot потерял соединение во время движения

- **WHEN** после последнего pilot input проходит ровно пять fixed steps
- **THEN** target становится нулевым, а castle velocity уменьшается по braking без мгновенной
  остановки

#### Scenario: Shield controller перестал отправлять hold

- **WHEN** shield aim достигает age 250 ms во время traverse
- **THEN** target отменяется, angular velocity плавно тормозит, current angle и active-state не
  прыгают

#### Scenario: Gunner controller перестал отправлять hold

- **WHEN** gunner input с `firing=true` достигает age 250 ms во время traverse
- **THEN** firing становится false, target отменяется, turret плавно тормозит и held cadence
  прекращается; не более одного уже принятого `queuedFire` MAY создать projectile

#### Scenario: Disconnect отменяет цель

- **WHEN** gunner либо shield disconnect происходит с недостигнутым target
- **THEN** room немедленно отменяет target, core тормозит rotation, а reconnect не продолжает
  прежний traverse
