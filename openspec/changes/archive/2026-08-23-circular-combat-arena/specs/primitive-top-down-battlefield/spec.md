## MODIFIED Requirements

### Requirement: Display показывает top-down мир примитивами

Phaser SHALL отображать square bounding world `4400×4400`, одну arena circumference radius 2200,
background grid только внутри arena, распределённые внутри circle декоративные не участвующие в
collision примитивы, spaceship body, turret, shield arc и projectiles средствами Graphics/Shape без
bitmap assets. Область за circle SHALL оставаться более тёмным deep-space background. Active
battlefield SHALL занимать весь CSS viewport без card padding, border, фиксированной 16:9 рамки и
letterbox. Базовая logical view SHALL быть не меньше `1600×900`; при другом aspect ratio camera
SHALL расширять видимую область по одной оси без растяжения world/circle и без обрезания базовой
области. React HUD, room code и connection status SHALL быть overlays и SHALL NOT уменьшать Phaser
viewport.

#### Scenario: Матч начинается

- **WHEN** room переходит в active и display получает первый snapshot
- **THEN** canvas покрывает viewport и показывает круглую нерастянутую arena, grid внутри неё,
  spaceship и примитивный мир, а компактный React HUD поверх показывает roles/status/ping

#### Scenario: Снаряд создан

- **WHEN** snapshot впервые содержит projectile `entityId`
- **THEN** display создаёт отдельный круг и двигает его к авторитетной position

#### Scenario: Экран меняет размер

- **WHEN** active display меняется между `1920×1080`, `1366×768` и `1024×768`
- **THEN** renderer/camera обновляются без пересоздания Room/runtime, canvas покрывает viewport,
  arena остаётся кругом и базовая logical область видима

### Requirement: Камера следует за spaceship

Camera SHALL следовать за визуально интерполированной spaceship position. Phaser scroll SHALL
учитывать renderer pixels, zoom и фактический responsive logical viewport, чтобы spaceship оставался
в центре вне edge zone. Presentation-only camera bounds SHALL использовать square bounding envelope
круга и расширяться на overscan `spaceship.radius + 42 + 160/zoom` world units. В любой достижимой
core position spaceship body, turret и shield arc SHALL оставаться полностью видимыми и не ближе 160
CSS pixels к viewport edge; у arena circumference viewport MAY показать ограниченный outside-space.
Circular grid и obstacles SHALL визуально прокручиваться относительно viewport. World transforms
SHALL сохранять дробные coordinates без принудительного pixel rounding.

#### Scenario: Spaceship летит вправо

- **WHEN** authoritative snapshots публикуют возрастающие x и x-velocity
- **THEN** camera scroll изменяется промежуточными дробными positions без скачка на каждый server
  tick

#### Scenario: Spaceship у края мира

- **WHEN** spaceship находится на cardinal либо diagonal legal boundary position при произвольном
  поддерживаемом aspect ratio
- **THEN** camera учитывает renderer/zoom, показывает ограниченный background за circle и оставляет
  весь spaceship/turret/shield минимум в 160 CSS pixels от viewport edge без дрожания

#### Scenario: Camera использует zoom

- **WHEN** renderer `1920×1080` показывает logical viewport `1600×900` и spaceship находится в
  центре arena `(2200,2200)`
- **THEN** camera midpoint совпадает с spaceship, а world-view top-left равен `(1400,1750)` без
  систематического сдвига из-за zoom
