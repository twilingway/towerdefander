## MODIFIED Requirements

### Requirement: Display показывает top-down мир примитивами

Phaser SHALL отображать world `4800×3200`, background grid, распределённые по всем квадрантам
декоративные не участвующие в collision примитивы, castle body, turret, shield arc и projectiles
средствами Graphics/Shape без bitmap assets. Active battlefield SHALL занимать весь CSS viewport без
card padding, border, фиксированной 16:9 рамки и letterbox. Базовая logical view SHALL быть не
меньше `1600×900`; при другом aspect ratio camera SHALL расширять видимую область по одной оси без
растяжения world и без обрезания базовой области. React HUD, room code и connection status SHALL
быть overlays и SHALL NOT уменьшать Phaser viewport.

#### Scenario: Матч начинается

- **WHEN** room переходит в active и display получает первый snapshot
- **THEN** canvas покрывает viewport и показывает круглый летающий замок и примитивный мир, а
  компактный React HUD поверх него показывает role labels, connection status и ping

#### Scenario: Снаряд создан

- **WHEN** snapshot впервые содержит projectileId
- **THEN** display создаёт отдельный круг и двигает его к авторитетной position

#### Scenario: Экран меняет размер

- **WHEN** active display меняется между `1920×1080`, `1366×768` и `1024×768`
- **THEN** renderer и camera viewport обновляются без пересоздания Room/runtime, canvas покрывает
  viewport, world не растягивается и базовая logical область остаётся видимой

### Requirement: Камера следует за летающим замком

Camera SHALL следовать за визуально интерполированной castle position. Phaser scroll SHALL учитывать
renderer pixels, zoom и фактический responsive logical viewport, чтобы castle оставался в центре вне
edge zone. Presentation-only camera bounds SHALL расширяться за world на overscan
`castle.radius + 42 + 160/zoom` world units. В любой достижимой core position castle body, turret и
shield arc SHALL оставаться полностью видимыми и не ближе 160 CSS pixels к viewport edge; у края
карта MAY закончиться раньше viewport и показать ограниченный background space. Background grid и
obstacles SHALL визуально прокручиваться относительно viewport. World transforms SHALL сохранять
дробные coordinates без принудительного pixel rounding.

#### Scenario: Замок летит вправо

- **WHEN** authoritative snapshots публикуют возрастающие x и x-velocity
- **THEN** camera scroll изменяется промежуточными дробными positions без скачка на каждый server
  tick

#### Scenario: Замок у края мира

- **WHEN** castle находится у границы world на display с произвольным поддерживаемым aspect ratio
- **THEN** camera учитывает renderer/zoom, показывает ограниченный background за world border и
  оставляет весь castle/turret/shield минимум в 160 CSS pixels от viewport edge без дрожания

#### Scenario: Camera использует zoom

- **WHEN** renderer `1920×1080` показывает logical viewport `1600×900` и castle находится в центре
  мира `(2400,1600)`
- **THEN** camera midpoint совпадает с castle, а world-view top-left равен `(1600,1150)` без
  систематического сдвига из-за zoom

## ADDED Requirements

### Requirement: Выключенный щит сохраняет видимое направление

Display SHALL рисовать shield arc по текущему авторитетному интерполированному angle независимо от
active-state и energy. Активный щит SHALL быть яркой синей дугой толщиной 16 и opacity 0.9;
выключенный, включая energy=0, SHALL быть тонкой приглушённой дугой толщиной 6 и opacity 0.35, чтобы
показывать направление, но не выглядеть как действующая защита. Геометрия дуги SHALL оставаться
`angle ± 0.72 rad`.

#### Scenario: Щит выключен

- **WHEN** authoritative snapshot содержит shield `active=false` с ненулевым angle
- **THEN** display показывает тонкую полупрозрачную дугу с этой стороны замка

#### Scenario: Щит включён

- **WHEN** authoritative snapshot меняет shield на `active=true`
- **THEN** та же дуга становится толстой ярко-синей без изменения авторитетного направления
