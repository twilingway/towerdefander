# spaceship-simulation Specification

## Purpose

TBD - created by archiving change spaceship-defender-identity-refactor. Update Purpose after
archive.
## Requirements
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
angle, nullable target angle и signed angular velocity отдельно для turret и shield. Дополнительно
config SHALL содержать heading max angular speed `13π/15 rad/s`, acceleration `26π/15 rad/s²` и
braking `13π/5 rad/s²` (ровно вдвое быстрее turret), MG fire cooldown 100 ms (2 ticks), MG damage 8,
MG projectile speed 900 units/s и radius 5, MG heat capacity 100, heat per shot 4, cooling 30
units/s и rearm threshold 30; state SHALL хранить spaceship heading current/target/angular velocity,
MG heat/overheated latch, queued MG fire edge и last MG fired tick. Current heading и machineGun
view (heat/capacity/overheated) SHALL публиковаться transport-клиентам; angular target/velocity и
RNG state SHALL оставаться внутренними trusted полями и SHALL NOT публиковаться.

#### Scenario: Одинаковое начальное состояние

- **WHEN** ядро дважды получает одинаковые config и run seed
- **THEN** оно создаёт структурно одинаковый square world `4400×4400` с arenaRadius 2200, spaceship
  в центре `(2200,2200)`, full HP, wave 1/combat, current angle 0, target `null` и angular velocity
  0 без DOM, сети, wall clock или несеянной случайности

#### Scenario: Некорректная конфигурация

- **WHEN** seed равен нулём, world не square/не равен диаметру arena, ambient interval не positive
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

> =250 ms stale pilot target SHALL стать нулевым и запустить обычное торможение, stale pilot
> `mgFiring` SHALL стать false, gunner `firing` SHALL стать false, а stale shield aim SHALL
> перестать обновлять направление. Последние turret/shield/heading current angles и устойчивое
> shield active-state SHALL сохраниться; MG heat/overheat latch SHALL сохраняться и остывать по
> обычным правилам; server disconnect handling SHALL отдельно выключать shield. Дополнительно stale
> pilot/gunner/shield SHALL отменять только angular target (включая heading target) и плавно
> тормозить angular velocity до нуля. Stale SHALL NOT очищать уже accepted `queuedFire` или queued
> MG fire request; trusted gunner/pilot disconnect SHALL по-прежнему очищать свои queued fire edges
> и angular targets. Reconnect SHALL начинаться без отменённых angular targets.

#### Scenario: Pilot потерял соединение во время движения

- **WHEN** после последнего pilot input проходит ровно пять fixed steps
- **THEN** target становится нулевым, а spaceship velocity уменьшается по braking без мгновенной
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

#### Scenario: Pilot перестал отправлять спуск пулемёта

- **WHEN** pilot input с `mgFiring=true` достигает age 250 ms во время traverse носа
- **THEN** mgFiring становится false, held cadence прекращается, heading target отменяется и nose
  плавно тормозит; не более одного уже принятого queued MG request MAY создать снаряд

### Requirement: Spaceship state включает здоровье и seeded combat

Spaceship core config SHALL добавлять validated spaceship max HP, combat tuning, entity caps и run
seed, не меняя fixedStepMs=50 и существующую movement/aim/shield authority. State SHALL публиковать
current/max HP, encounter phase, wave/score и applied role modifiers. HP, damage, RNG state, offers
и combat entities SHALL изменяться только pure core transitions.

#### Scenario: Combat run начинается

- **WHEN** три ready role запускают room с valid config и run seed
- **THEN** spaceship находится в центре прежнего мира с full HP, wave 1/combat, исходными modifiers
  и deterministic spawn plan

#### Scenario: Pilot получил handling upgrade

- **WHEN** accepted pilot modifier вступает в силу в следующей wave
- **THEN** target max speed/acceleration используют upgraded values, сохраняя normalization, braking
  и world-bound invariants

#### Scenario: Max HP увеличен

- **WHEN** pilot выбирает max-HP/repair offer
- **THEN** max HP возрастает на configured amount, current HP ремонтируется не выше нового max HP и
  display/controllers получают одинаковые значения

### Requirement: Нос корабля следует за movement input пилота

State SHALL хранить current spaceship heading (канонизированный угол), nullable target heading и
signed angular velocity отдельно от turret и shield. Initial heading clean run SHALL равняться 0
(вправо). Свежий ненулевой pilot movement vector SHALL задавать target heading по направлению
vector; нулевой vector SHALL сохранять последнее target-направление (latched). Fixed step SHALL
приближать current heading к target по кратчайшей дуге с configured acceleration, braking и max
angular speed без overshoot; exact antipode SHALL выбирать положительную дугу π. Stale pilot input
(age >= 250 ms) SHALL отменить target heading и плавно затормозить angular velocity до нуля,
сохранив current angle. Trusted pilot disconnect и combat→intermission neutralization SHALL
выполнить то же самое через trusted core transition; reconnect SHALL начинаться без восстановленного
target. Current heading SHALL публиковаться transport-клиентам как часть spaceship view.

#### Scenario: Нос следует за диагональю

- **WHEN** из покоя pilot удерживает нормализованный vector вверх-вправо несколько fixed steps
- **THEN** target heading становится -π/4, а current heading приближается к нему по кратчайшей дуге
  без превышения configured angular acceleration step

#### Scenario: Отпускание не сбрасывает нос

- **WHEN** pilot после ненулевого vector отправляет нулевой до достижения target
- **THEN** target сохраняется и nose завершает плавный traverse к нему

#### Scenario: Разворот на 180 градусов без перелёта

- **WHEN** heading направлен вправо и свежий movement vector задаёт противоположный target
- **THEN** current heading достигает target, angular velocity становится нулевой, ни один snapshot
  не проходит за target и |angular velocity| не превышает configured max speed

#### Scenario: Stale input останавливает поворот

- **WHEN** pilot input с ненулевым vector достигает age 250 ms во время traverse носа
- **THEN** target отменяется, angular velocity плавно тормозит до нуля, а current angle сохраняется

### Requirement: Пилот ведёт огонь из носового пулемёта с перегревом

`pilot:input` SHALL содержать boolean `mgFiring`. Fresh `mgFiring=true` SHALL создавать не более
одного MG снаряда при каждом завершении mg cooldown (100 ms / 2 fixed steps). Первый принятый rising
edge при отсутствии pending request SHALL поставить ровно один queued MG fire request; request SHALL
сохраниться до ближайшего разрешённого tick и consumed одним снарядом даже если release пришёл
раньше следующего tick. Дополнительные rising edges пока request pending SHALL coalesce и не
накапливать очередь. Снаряд SHALL спавниться у носа: position = spaceship center + heading
direction * (spaceshipRadius + mgProjectileRadius), velocity по current authoritative heading на
fire tick, speed 900 units/s, radius 5, damage 8 без role modifiers. MG снаряды являются `friendly`
projectiles и подчиняются общим collision/damage/caps правилам.

Каждый spawned MG снаряд SHALL увеличивать heat на mgHeatPerShot (4) с clamp до capacity 100. На
тиках без spawned снаряда heat SHALL уменьшаться на cooling 30 units/s с clamp до 0. При достижении
capacity MG SHALL стать overheated и SHALL NOT создавать снаряды; overheat latch SHALL сняться
только когда heat <= rearm threshold 30. Если `mgFiring` остаётся true после rearm, cadence SHALL
возобновиться автоматически без нового input. Heat продолжает остывать в intermission. MG
heat/capacity/overheated SHALL публиковаться transport-клиентам как machineGun view. Stale pilot
input SHALL сделать mgFiring false; trusted pilot disconnect и combat→intermission neutralization
SHALL очистить queued MG fire request, задать mgFiring false и отменить heading target.

#### Scenario: Удерживаемый огонь из носа

- **WHEN** pilot удерживает `mgFiring=true` десять fixed steps при свежем input и cooldown 2 ticks
- **THEN** создаётся ровно пять MG снарядов, каждый спавнится у носа по current heading этого tick,
  а heat увеличивается на 4 за каждый снаряд

#### Scenario: Короткий тап по спуску

- **WHEN** server принимает rising `mgFiring=true` и последующий false между simulation ticks
- **THEN** core создаёт ровно один MG снаряд на ближайшем eligible tick по current heading

#### Scenario: Несколько тапов во время cooldown

- **WHEN** pending MG request уже существует и до consume приходят новые rising edges
- **THEN** core сохраняет один pending request и создаёт один снаряд на ближайшем eligible tick

#### Scenario: Перегрев под удержанием

- **WHEN** pilot непрерывно держит спуск от остывшего состояния, пока heat достигает capacity 100
- **THEN** MG становится overheated и не создаёт снаряды, пока heat > rearm threshold; после
  остывания до <=30 cadence возобновляется автоматически при удержанном `mgFiring=true`

#### Scenario: Остывание от перегрева

- **WHEN** MG не стреляет при heat=100 в течение 47 fixed steps
- **THEN** heat уменьшается на 30 units/s и становится <= rearm threshold, после чего следующий
  eligible выстрел разрешён

#### Scenario: Cap friendly projectiles занят

- **WHEN** cap 32 friendly projectiles занят и MG eligible к выстрелу
- **THEN** снаряд не создаётся, pending request consumed, а следующий выстрел возможен только после
  полного mg cooldown без burst

#### Scenario: Stale спуск останавливает огонь

- **WHEN** pilot input с `mgFiring=true` достигает age 250 ms во время traverse носа
- **THEN** mgFiring становится false, held cadence прекращается, heading target отменяется и nose
  плавно тормозит; не более одного уже принятого queued request MAY создать снаряд

#### Scenario: Disconnect со спуском

- **WHEN** pilot disconnect происходит с pending MG fire request
- **THEN** server очищает pending request и heading target; reconnect начинается с mgFiring=false,
  не создаёт delayed projectile и не продолжает traverse

