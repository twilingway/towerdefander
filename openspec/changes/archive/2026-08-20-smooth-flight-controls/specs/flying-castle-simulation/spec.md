## MODIFIED Requirements

### Requirement: Симуляция создаёт явный мир летающего замка

Game-core SHALL создавать детерминированное состояние из явного config. Config SHALL содержать
fixedStepMs=50, world `2400×1600`, castle radius/max speed, acceleration 640 units/s², braking 800
units/s², input timeout 250 ms, projectile speed/lifetime, fire cooldown 250 ms, shield capacity
100, drain 20 units/s и recharge 10 units/s. State SHALL содержать clock, castle position/velocity,
turret angle, queued gunner fire edge, shield angle/active/energy/rearm latch, latest role inputs и
projectiles.

#### Scenario: Одинаковое начальное состояние

- **WHEN** ядро дважды получает одинаковый config
- **THEN** оно создаёт структурно одинаковый мир без DOM, сети, wall clock или несеянной случайности

#### Scenario: Некорректная конфигурация

- **WHEN** размеры, fixed step, speed, acceleration, braking, timeout, cooldown, lifetime или shield
  capacity/rates неположительны
- **THEN** ядро отклоняет config и не возвращает частичное состояние

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

### Requirement: Shield operator направляет сектор щита

Свежий ненулевой shield input SHALL задавать shield angle, а нулевой vector SHALL сохранять
последнее направление. Boolean `active` SHALL быть абсолютным устойчивым ON/OFF intent, а не
hold-состоянием. Начальная energy SHALL равняться capacity 100. При фактически активном щите ядро
SHALL уменьшать energy на drain 20 units/s; при выключенном SHALL восстанавливать её на 10 units/s;
energy SHALL оставаться в диапазоне 0..capacity. При достижении нуля shield SHALL автоматически
выключиться и SHALL NOT повторно включаться от последующих heartbeat с прежним `active=true`:
требуется принятый `false`, затем новый `true` при energy>0.

#### Scenario: Щит удерживается слева

- **WHEN** operator направляет stick влево и один раз переключает shield в ON
- **THEN** snapshot показывает active shield слева, а отпускание кнопки не меняет active

#### Scenario: Щит отпущен

- **WHEN** operator отпускает кнопку после ручного переключения shield в ON
- **THEN** shield остаётся active и продолжает расходовать energy до явного OFF либо разряда

#### Scenario: Энергия полностью расходуется

- **WHEN** полный щит остаётся активным 100 fixed steps, то есть пять секунд
- **THEN** energy достигает нуля, shield становится inactive, а повторные `active=true` heartbeat не
  включают его автоматически

#### Scenario: Энергия восстанавливается

- **WHEN** щит выключен при energy=0 в течение 200 fixed steps, то есть десять секунд
- **THEN** energy становится равной capacity 100 и больше не растёт

#### Scenario: Ручное повторное включение после разряда

- **WHEN** после разряда server принимает `active=false`, energy становится больше нуля, а затем
  принимает новый `active=true`
- **THEN** shield снова становится active и продолжает расходовать текущий запас

### Requirement: Просроченный continuous input безопасно сбрасывается

Ядро SHALL считать pilot/gunner/shield aim свежим пока age меньше 250 ms simulation time. При age

> =250 ms stale pilot target SHALL стать нулевым и запустить обычное торможение, gunner `firing`
> SHALL стать false, а stale shield aim SHALL перестать менять направление. Последние turret/shield
> angles SHALL сохраниться. Stale shield heartbeat SHALL NOT сам менять устойчивое active-состояние;
> server disconnect handling SHALL отдельно выключать щит.

#### Scenario: Pilot потерял соединение во время движения

- **WHEN** после последнего pilot input проходит ровно пять fixed steps
- **THEN** target становится нулевым, а castle velocity уменьшается по braking без мгновенной
  остановки

#### Scenario: Shield controller перестал отправлять hold

- **WHEN** shield input достигает age 250 ms
- **THEN** shield сохраняет последний angle и текущее active-состояние до ручного OFF либо
  disconnect

#### Scenario: Gunner controller перестал отправлять hold

- **WHEN** gunner input с `firing=true` достигает age 250 ms
- **THEN** firing автоматически становится false и новые projectiles не создаются
