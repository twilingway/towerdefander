## ADDED Requirements

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

Camera SHALL плавно следовать за authoritative castle position и SHALL оставаться внутри world
bounds. Background grid и obstacles SHALL визуально прокручиваться относительно viewport.

#### Scenario: Замок летит вправо

- **WHEN** castle x увеличивается дальше центра viewport
- **THEN** camera scroll x увеличивается, а castle остаётся читаемым около центра экрана

#### Scenario: Замок у края мира

- **WHEN** castle находится у границы world
- **THEN** camera не показывает область за world bounds

### Requirement: Display интерполирует, но не владеет состоянием

Display SHALL интерполировать castle/turret/shield/projectile transforms между snapshots и SHALL
корректироваться к новому snapshot. Phaser SHALL NOT создавать trusted projectile, менять cooldown
или position самостоятельно.

#### Scenario: Локальная позиция расходится

- **WHEN** новый snapshot отличается от текущей tween position
- **THEN** визуальный объект плавно корректируется к server position

#### Scenario: Display переподключается

- **WHEN** display reconnect получает актуальный snapshot
- **THEN** scene пересоздаёт castle и projectiles без воспроизведения пропущенных inputs
