# primitive-top-down-battlefield Specification

## Purpose

TBD - created by archiving change flying-castle-core. Update Purpose after archive.

## Requirements

### Requirement: Display показывает top-down мир примитивами

Phaser SHALL отображать world `2400×1600`, background grid, декоративные не участвующие в collision
примитивы, castle body, turret, shield arc и projectiles средствами Graphics/Shape без bitmap
assets. Logical viewport SHALL быть `1280×720` и landscape-safe.

#### Scenario: Матч начинается

- **WHEN** room переходит в active и display получает первый snapshot
- **THEN** canvas показывает круглый летающий замок и прямоугольные башни/декорации, а React HUD
  отдельно показывает role labels и connection status

#### Scenario: Снаряд создан

- **WHEN** snapshot впервые содержит projectileId
- **THEN** display создаёт отдельный круг и двигает его к авторитетной position

### Requirement: Камера следует за летающим замком

Camera SHALL следовать за визуально интерполированной castle position и SHALL оставаться внутри
world bounds. Background grid и obstacles SHALL визуально прокручиваться относительно viewport.
World transforms SHALL сохранять дробные coordinates без принудительного pixel rounding.

#### Scenario: Замок летит вправо

- **WHEN** authoritative snapshots публикуют возрастающие x и x-velocity
- **THEN** camera scroll изменяется промежуточными дробными positions без скачка на каждый server
  tick

#### Scenario: Замок у края мира

- **WHEN** castle находится у границы world
- **THEN** camera не показывает область за world bounds и не дрожит от outward velocity correction

### Requirement: Display интерполирует, но не владеет состоянием

Display SHALL хранить previous/latest authoritative snapshots и SHALL вычислять визуальные
castle/turret/shield/projectile transforms как функцию snapshot ticks и render delta, а не
фиксированного процента на frame. При 60 Hz и 120 Hz одинаковая пара snapshots SHALL давать
эквивалентную position trajectory по elapsed time с tolerance 0.01 world unit и angular trajectory с
tolerance 0.001 rad. Display SHALL корректироваться к server position и angle за 50 ms. Turret и
shield angle SHALL интерполироваться по кратчайшей дуге с canonical wrap через ±π. Display SHALL NOT
создавать trusted projectile, energy, velocity, angular target или cooldown самостоятельно. Только
первый snapshot, новый projectile и hydration MAY начинаться непосредственно с authoritative
transform.

#### Scenario: Локальная позиция расходится

- **WHEN** display получает positions и angles для соседних 50 ms ticks и рисует несколько кадров
  между ними
- **THEN** визуальный объект проходит промежуточные positions и angles вместо ожидания следующего
  patch и достигает authoritative transform за 50 ms

#### Scenario: Частота кадров различается

- **WHEN** один display рисует position и angular trace при 60 Hz, а другой при 120 Hz
- **THEN** их positions в одинаковый elapsed time отличаются не более чем на 0.01 world unit, а
  angles — не более чем на 0.001 rad

#### Scenario: Display переподключается

- **WHEN** reconnect получает актуальный snapshot во время authoritative traverse
- **THEN** scene сбрасывает interpolation buffer к current server position и angle, пересоздаёт
  projectiles без проигрывания пропущенных inputs, а следующие snapshots снова интерполируются

#### Scenario: Угол проходит через wrap

- **WHEN** соседние authoritative angles находятся по разные стороны границы `π/-π`
- **THEN** visual turret и shield проходят короткую дугу без почти полного оборота
