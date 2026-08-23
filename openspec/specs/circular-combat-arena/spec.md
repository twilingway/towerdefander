# circular-combat-arena Specification

## Purpose
TBD - created by archiving change circular-combat-arena. Update Purpose after archive.
## Requirements
### Requirement: Authoritative arena имеет круглую геометрию

Current strict game snapshot SHALL публиковать square bounding world `4400×4400` и
`arenaRadius=2200`. Arena center SHALL быть `(worldWidth/2,worldHeight/2)`. Config и strict schema
SHALL требовать `worldWidth === worldHeight === arenaRadius*2`; server SHALL быть единственным
владельцем geometry и positions.

#### Scenario: Новый run создаёт круглый мир

- **WHEN** server создаёт run с prototype config
- **THEN** initial snapshot содержит world `4400×4400`, arenaRadius 2200 и spaceship в центре
  `(2200,2200)`

#### Scenario: Geometry противоречива

- **WHEN** snapshot/config содержит radius, не равный половине square world
- **THEN** strict validation отклоняет geometry без частичного state

### Requirement: Spaceship и enemy ships полностью остаются в арене

Для spaceship и каждого enemy ship расстояние его center до arena center плюс entity radius SHALL
быть не больше arenaRadius. Если fixed-step candidate выходит наружу, core SHALL спроецировать
center на legal circle, удалить только направленную наружу radial component velocity и сохранить
tangent либо направленную внутрь component. Enemy ship SHALL NOT удаляться boundary cleanup.

#### Scenario: Pilot движется наружу по диагонали

- **WHEN** spaceship у diagonal rim имеет velocity с outward и tangent components
- **THEN** весь body остаётся внутри circle, outward component становится нулевой, tangent
  сохраняется и snapshot не выходит за legal radius

#### Scenario: Enemy отступает от spaceship у края

- **WHEN** chase AI много fixed steps рассчитывает outward retreat/orbit у arena rim
- **THEN** enemy полностью остаётся внутри, не удаляется и продолжает tangential движение

#### Scenario: Цель возвращается к центру

- **WHEN** constrained enemy получает следующий AI direction внутрь arena
- **THEN** inward component применяется и enemy уходит от boundary без teleport

### Requirement: Spawn и transient cleanup используют окружность

Enemy ships SHALL детерминированно spawn-иться по seeded angle уже полностью внутри legal circle. В
течение каждой combat phase отдельный seeded ambient scheduler SHALL создавать asteroids через
40–100 ticks с entry angle по всей окружности и exit target на противоположной полусфере с offset не
больше `±π/3`. Ambient stream SHALL использовать независимый RNG domain, SHALL работать при
отсутствии capacity только после освобождения slot и SHALL NOT блокировать завершение wave. Asteroid
SHALL spawn-иться на legal perimeter с направленной внутрь velocity и MAY пересечь арену насквозь.
Asteroids, friendly/hostile projectiles и homing missiles SHALL удаляться после lifetime либо выхода
за circular padded envelope; enemy ships SHALL жить до destruction или run clear. Collision sweep
SHALL выполняться до transient cleanup.

#### Scenario: Один seed повторяет spawn angles

- **WHEN** два core instance получают один config, seed и input trace
- **THEN** entity spawn angles, identities и transitions структурно совпадают

#### Scenario: Enemy появился на окружности

- **WHEN** wave выпускает gunship либо missileCarrier
- **THEN** весь enemy circle находится внутри arena и его seeded position совпадает при replay

#### Scenario: Asteroid пролетает арену

- **WHEN** asteroid spawn-ится на perimeter и не сталкивается с target
- **THEN** он движется по постоянной velocity, пересекает circle и удаляется после выхода за
  circular padded envelope либо lifetime

#### Scenario: Ambient asteroids продолжают появляться

- **WHEN** combat продолжается дольше нескольких scheduler intervals и cap имеет свободные slots
- **THEN** asteroids с разными seeded entry/exit angles появляются через каждый interval 40–100
  ticks независимо от pending wave spawn plan

#### Scenario: Ambient asteroid не удерживает wave

- **WHEN** pending wave queue, enemy ships и wave-origin asteroids закончились, ambient asteroid ещё
  летит, а spaceship пережил fixed step
- **THEN** encounter переходит в intermission, ambient asteroid очищается и новый ambient spawn не
  выполняется до следующей combat phase

#### Scenario: Defeat имеет приоритет над завершением wave

- **WHEN** последний wave-origin target исчез и ambient hazard на том же tick уменьшил spaceship HP
  до нуля
- **THEN** encounter переходит в frozen result/defeat, а не в intermission

#### Scenario: Asteroid cap временно заполнен

- **WHEN** ambient spawn due при 16 asteroids либо общем cap 196
- **THEN** core не превышает caps и принимает due spawn после первого освободившегося slot без
  случайного burst

#### Scenario: Wave и ambient spawn готовы одновременно

- **WHEN** pending wave-origin asteroid и ambient due конкурируют за один оставшийся asteroid slot
- **THEN** core сначала создаёт wave-origin asteroid, ambient due остаётся pending и RNG ambient
  stream не продвигается

#### Scenario: Новая wave получает свежую задержку

- **WHEN** blocked ambient due очищен переходом в intermission и начинается следующая combat phase
- **THEN** independent RNG stream выбирает новый inclusive interval 40–100 ticks, на combat tick 0
  asteroid не создаётся и stale burst отсутствует

#### Scenario: Hit происходит на boundary tick

- **WHEN** transient endpoint вышел за circle, но swept segment этого tick пересёк target
- **THEN** hit/damage регистрируется один раз до удаления surviving out-of-bounds transient

### Requirement: Display показывает круг, а не круглый viewport

Phaser SHALL рисовать одну нерастянутую arena circumference и grid только внутри circle. Внешняя
часть обычного rectangular screen/camera SHALL оставаться более тёмным deep-space background. Camera
SHALL использовать square arena bounding envelope и authoritative spaceship position; display SHALL
NOT ограничивать entities или изобретать physics.

#### Scenario: Разные aspect ratios показывают тот же круг

- **WHEN** active display меняется между `1920×1080`, `1366×768` и `1024×768`
- **THEN** arena остаётся кругом без растяжения, grid не выходит наружу и canvas покрывает весь
  rectangular viewport

#### Scenario: Spaceship находится на cardinal или diagonal rim

- **WHEN** authoritative spaceship занимает любую legal boundary position
- **THEN** camera сохраняет existing safe screen margin, а circle/outside-space не вызывают дрожание

### Requirement: Protocol migration сохраняет authority

Protocol v11 SHALL публиковать `arenaRadius` в controller/display game views. Create, join и
gameplay message v10 SHALL получать `protocol_mismatch` до roster, watermark, journal или world
mutation. Reconnect v11 SHALL сразу получить current arena geometry и legal authoritative positions.

#### Scenario: V10 создаёт новую комнату

- **WHEN** display отправляет create options с protocolVersion 10
- **THEN** server отклоняет create как `protocol_mismatch` и не создаёт gameplay room

#### Scenario: V11 controller reconnect

- **WHEN** controller восстанавливает identity во время combat
- **THEN** его strict projection содержит arenaRadius и current legal spaceship position без
  client-side correction

### Requirement: Circular checks сохраняют entity budget

Pure geometry SHALL быть constant-time на entity и SHALL NOT менять caps `40/16/96/12/32` и общий
cap 196. Worst-case benchmark SHALL сохранять reference pure/room step p95 не выше 2 ms на
документированной машине.

#### Scenario: Worst-case room содержит 196 entities

- **WHEN** benchmark выполняет circular movement/cleanup и StateView sync
- **THEN** caps не превышены, state детерминирован и documented p95 остаётся в budget 2 ms

