## Why

Текущий authoritative world прямоугольный: enemy ships при отступлении или орбитальном движении не
учитывают границу, улетают за видимое поле и затем удаляются через прямоугольный padding. Игрок
может непреднамеренно увести преследуемого противника за карту, поэтому форма поля и правила
движения должны стать единым круглым server-authoritative контрактом.

## What Changes

- **BREAKING** поднять protocol до v11 и публиковать явный `arenaRadius` вместе с квадратным
  bounding world `4400×4400`; v10 отклоняется до mutation, reconnect storage key меняется с `.v1` на
  `.v2`, а старый record удаляется до reconnect.
- Сделать игровую арену кругом с центром `(2200,2200)` и radius `2200`, сохранив примерно ту же
  площадь, что у прежнего мира `4800×3200`.
- Удерживать весь spaceship body и enemy ships внутри окружности с учётом radius; на границе убирать
  только направленную наружу нормальную скорость и сохранять касательную/направленную внутрь.
- Спавнить enemy ships детерминированно по окружности уже внутри legal radius и больше не удалять их
  из-за выхода за world bounds.
- Добавить независимый seeded ambient asteroid stream: во время combat астероиды постоянно входят с
  разных случайных сторон и летят к случайной противоположной стороне, не блокируя завершение wave.
- Оставить asteroids пролётными угрозами; bullets, missiles, asteroids и friendly projectiles после
  collision sweep удалять по circular padded envelope или lifetime.
- Рисовать круглый grid/border в Phaser, оставляя область снаружи глубоким космосом; camera следует
  за authoritative spaceship внутри квадратного bounding box круга.
- Перевести активные требования со старых hard-coded protocol versions на v11 либо формулировку
  `current strict protocol`, не меняя gameplay/economy/reconnect semantics.

Не входит: физическое отражение hazards, CSS-круглый viewport, true 3D, новая арт-система, изменение
enemy caps, wave budgets, damage/economy или camera zoom.

## Capabilities

### New Capabilities

- `circular-combat-arena`: authoritative геометрия круга, containment, edge response, spawn/cleanup
  и визуальное соответствие общей арены.

### Modified Capabilities

- `spaceship-simulation`: квадратный `4400×4400` bounding world и круговая граница pilot movement.
- `authoritative-space-combat`: circular spawn/containment enemy ships и circular cleanup hazards.
- `primitive-top-down-battlefield`: круглый grid/border, outside-space и camera framing.
- `product-identity`: strict protocol v11 и migration с v10.
- `shared-room-session`: v11 StateView geometry и protocol mismatch semantics.
- `three-role-controls`: current strict protocol envelopes без изменения intent semantics.
- `run-rematch-lifecycle`: v11 run epoch contract и v10 mismatch.
- `connection-latency-diagnostics`: telemetry использует current strict protocol без устаревшего v8.
- `role-roguelite-upgrades`: upgrade command использует current strict protocol без устаревшего v8.
- `wave-campaign`: wave projection использует current strict protocol без устаревшего v8.

## Impact

- `packages/game-core`: pure circular geometry, spaceship/enemy movement, seeded spawn и cleanup.
- `packages/protocol`: v11, `arenaRadius`, strict circular cross-field validation.
- `apps/server`: Colyseus state/projection defaults и v10 rejection tests.
- `apps/display`: room adapter, circular grid/border и camera tests.
- `apps/controller`: v11 fixtures/messages; mass entity state по-прежнему не публикуется
  controllers.
- OpenSpec/docs/tests/benchmarks обновляются; production dependencies и deployment topology не
  меняются.
