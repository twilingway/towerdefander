# flying-castle-simulation Specification

## Purpose
TBD - created by archiving change flying-castle-core. Update Purpose after archive.
## Requirements
### Requirement: Симуляция создаёт явный мир летающего замка

Game-core SHALL создавать детерминированное состояние из явного config. Config SHALL содержать
fixedStepMs=50, world `2400×1600`, castle radius/speed, input timeout 250 ms, projectile
speed/lifetime и fire cooldown 250 ms. State SHALL содержать clock, castle position/velocity, turret
angle, shield angle/active, latest role inputs и projectiles.

#### Scenario: Одинаковое начальное состояние

- **WHEN** ядро дважды получает одинаковый config
- **THEN** оно создаёт структурно одинаковый мир без DOM, сети, wall clock или несеянной случайности

#### Scenario: Некорректная конфигурация

- **WHEN** размеры, fixed step, speed, timeout, cooldown или lifetime неположительны
- **THEN** ядро отклоняет config и не возвращает частичное состояние

### Requirement: Pilot перемещает замок фиксированными шагами

Pilot input SHALL быть нормализованным vector `x,y` в диапазоне -1..1. Ядро SHALL ограничивать длину
диагонального vector единицей, вычислять velocity и перемещать центр замка, не выпуская его radius
за границы мира.

#### Scenario: WASD направлен вправо

- **WHEN** свежий pilot vector равен `{x:1,y:0}` и выполняется один fixed step
- **THEN** castle x увеличивается на `speedPerSecond * fixedStepMs / 1000`, а y не меняется

#### Scenario: Диагональ не быстрее прямого движения

- **WHEN** pilot отправляет `{x:1,y:1}`
- **THEN** длина применённой velocity не превышает настроенную скорость

#### Scenario: Замок достигает границы

- **WHEN** движение вывело бы castle radius за край мира
- **THEN** position прижимается к допустимой границе

### Requirement: Gunner направляет пушку и создаёт снаряды

Свежий ненулевой gunner aim vector SHALL задавать turret angle; нулевой vector SHALL сохранять
последнее направление, по умолчанию вправо. Свежий `firing=true` SHALL создавать не более одного
projectile у края замка в направлении turret angle при каждом завершении cooldown. Fixed step SHALL
двигать projectiles и удалять их после lifetime или выхода за границы мира.

#### Scenario: Пушка поворачивается

- **WHEN** gunner aim vector направлен вверх
- **THEN** следующий snapshot публикует turret angle вверх

#### Scenario: Нулевое направление пушки

- **WHEN** gunner после направления вверх отправляет нулевой aim vector
- **THEN** turret angle остаётся направлен вверх

#### Scenario: Разрешённый выстрел

- **WHEN** cooldown завершён и latest accepted gunner input содержит `firing=true` на authoritative
  simulation tick
- **THEN** появляется один projectile с server identity и направленной velocity

#### Scenario: Cooldown ещё активен

- **WHEN** `firing=true` продолжает удерживаться раньше 250 ms после принятого выстрела
- **THEN** новый projectile не создаётся

### Requirement: Shield operator направляет сектор щита

Свежий ненулевой shield input SHALL задавать shield angle, нулевой vector SHALL сохранять последнее
направление, и active flag SHALL независимо включать сектор. Snapshot SHALL хранить эти значения как
подготовку к будущей авторитетной проверке попаданий.

#### Scenario: Щит удерживается слева

- **WHEN** shield operator направляет stick влево и удерживает activate
- **THEN** snapshot показывает active shield sector слева от замка

#### Scenario: Щит отпущен

- **WHEN** operator отправляет `active=false`
- **THEN** snapshot публикует неактивный shield

### Requirement: Просроченный continuous input безопасно сбрасывается

Ядро SHALL считать pilot/gunner/shield input свежим пока его age меньше 250 ms simulation time. При
age >=250 ms просроченный pilot vector SHALL стать нулевым, gunner `firing` SHALL стать false, а
shield SHALL стать inactive. Последний turret/shield angle SHALL сохраниться для стабильной
визуализации.

#### Scenario: Pilot потерял соединение во время движения

- **WHEN** после последнего pilot input проходит ровно пять fixed steps, то есть 250 ms
- **THEN** castle velocity становится нулевой на следующем fixed step

#### Scenario: Shield controller перестал отправлять hold

- **WHEN** shield input просрочен
- **THEN** shield автоматически становится inactive

#### Scenario: Gunner controller перестал отправлять hold

- **WHEN** gunner input с `firing=true` достигает age 250 ms
- **THEN** firing автоматически становится false и новые projectiles не создаются

