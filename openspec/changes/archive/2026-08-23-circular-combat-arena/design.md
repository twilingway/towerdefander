## Context

Сейчас config задаёт прямоугольник `4800×3200`. Pilot независимо clamp-ится по X/Y, enemy AI считает
chase/retreat/orbit только относительно spaceship, spawn использует четыре прямоугольных edge, а
cleanup допускает ещё `worldPadding=240` за рамкой. Поэтому преследуемый enemy может уйти за display
border и исчезнуть без уничтожения. Phaser рисует grid и `strokeRect`, а protocol v10 валидирует
только padded rectangle.

Изменение затрагивает pure core, strict wire schema, Colyseus projection и Phaser renderer. Сервер
остаётся единственным владельцем геометрии и entity positions.

## Goals / Non-Goals

**Goals:**

- круглая authoritative arena примерно той же площади, что прежний world;
- spaceship и enemy ships никогда не публикуются за legal circle;
- плавное tangential движение на границе без телепорта/залипания;
- deterministic circular spawn и collision-before-cleanup;
- display визуально отличает игровую окружность от внешнего космоса;
- strict v11 geometry и reconnect hydration.

**Non-Goals:**

- отражение asteroids/projectiles, collision с border или damage от border;
- круглый CSS viewport/обрезание телевизионного экрана;
- новая camera scale, wave balance, caps, damage/economy, art assets или dependencies;
- client prediction либо client-side исправление authoritative coordinates.

## Decisions

### Geometry и compatibility

Config получает `arenaRadius=2200`, `worldWidth=4400`, `worldHeight=4400`. Arena center всегда
`(worldWidth/2, worldHeight/2)`, а validation требует
`worldWidth === worldHeight === 2*arenaRadius`. Площадь `π*2200²` отличается от прежних `4800*3200`
примерно на 1%, поэтому spatial balance почти не меняется.

Protocol повышается до v11. Общий game snapshot публикует `arenaRadius`; center не дублируется в
wire. Strict schemas проверяют geometry cross-field, весь spaceship/enemy circle и circular padded
envelope transient entities. Старый v10 display не знает форму, поэтому hard cut честнее скрытой
смены semantics. Controller storage key меняется с `spaceship-defender.controller-session.v1` на
`.v2`; startup удаляет `.v1` и прежний town-defenders key до вызова `Client.reconnect`. Все
hard-coded historical active-version literals заменяются на v11 только в compatibility requirement,
а в остальных capabilities — на `current strict protocol`.

Отклонено: вписанный круг radius 1600 в `4800×3200` — теряет около 48% площади. Отклонён круг
diameter 4800 — незапрошенно увеличивает площадь примерно на 18%.

### Pure circular helpers

`game-core` владеет pure helpers:

- squared distance/containment для moving circle;
- projection candidate center на `arenaRadius-entityRadius`;
- decomposition velocity на radial normal + tangent;
- удаление только положительной outward normal component;
- circular padded containment для transient cleanup.

При projection `previousX/previousY` остаются прежней authoritative position, чтобы swept collision
видел реальный fixed-step segment. Inward/tangential velocity сохраняется. Exact center использует
нулевую normal без деления на ноль.

### Spaceship и enemy ships

Pilot использует прежние acceleration/braking, затем circular projection. Enemy сначала вычисляет
прежний chase/retreat/orbit velocity, затем применяет тот же constraint с собственным radius. Это
даёт немедленный invariant даже при резком target move; следующий tick AI снова может направить
enemy внутрь. Enemy ships больше не удаляются out-of-bounds cleanup и остаются до destruction/run
clear.

Enemy spawn берёт seeded angle из существующего spawn RNG и ставит центр на внутренний legal radius.
Порядок RNG draws/spawnSequence остаётся детерминированным.

Asteroids имеют internal origin `wave|ambient`, не публикуемый transport. Отдельный
`ambientAsteroidRngState` не изменяет wave-spawn/offer streams. В combat scheduler выбирает
следующий интервал равномерно и детерминированно в validated диапазоне 40–100 ticks (2–5 s), entry
angle по всей окружности и exit target на противоположной полусфере с seeded offset до `±π/3`. Если
asteroid cap 16 или global cap 196 заполнен, due spawn не теряется и выполняется при первом
доступном slot; RNG/следующий interval потребляются только при принятом spawn. Ambient asteroid
наносит обычный damage, может быть уничтожен и даёт обычный asteroid score, но не входит в условие
завершения wave. При одном eligible tick core сначала пытается выполнить pending wave-origin spawn и
только затем ambient spawn на оставшейся capacity; заблокированный ambient due остаётся pending без
RNG advance и без накопления burst. При переходе в intermission все ambient asteroids и due/deadline
очищаются, independent RNG state сохраняется. При старте следующей combat phase core выбирает новый
inclusive delay 40–100 ticks, поэтому ambient asteroid не появляется на tick 0. Wave-origin asteroid
по-прежнему входит в remaining wave population. Любой asteroid начинает на legal perimeter и
направлен внутрь, не constrain-ится, пересекает арену и удаляется после circular padded
envelope/lifetime.

### Collision и cleanup ordering

Fixed step сохраняет порядок move → spawn → collision sweep → cleanup. Friendly/hostile projectiles,
homing missiles и asteroids могут иметь endpoint за arena boundary на collision tick, чтобы swept
hit у края не потерялся; surviving transient затем удаляется circular cleanup. Padding остаётся
ограниченным и применяется радиально. Enemy ships исключены из boundary cleanup.

### Projection и rendering

Colyseus `SpaceshipDefenderGameState` добавляет `arenaRadius`; room sync берёт его только из core
config. Controller получает compact geometry без mass entities, display — ту же geometry и entities.
Reconnect создаёт новую v11 projection/hydration без изменения simulation.

Phaser рисует square camera bounding envelope, но arena background/grid маскирует кругом и рисует
один `strokeCircle`. Outside circle остаётся более тёмным deep-space background. Camera math
получает те же square `worldWidth/worldHeight`; cardinal/diagonal legal spaceship positions остаются
в safe framing. Renderer не clamp-ит entities и не вычисляет collision.

## Risks / Trade-offs

- **[Phaser GeometryMask может создать лишний GPU cost на Android TV]** → один static Graphics mask
  создаётся при scene creation/geometry change, не перерисовывается каждый frame; benchmark/render
  smoke сохраняет existing entity budget.
- **[Projection floating-point epsilon может давать schema rejection]** → общий tolerance/helper и
  projection точно на legal radius; protocol refinement допускает только фиксированный малый epsilon
  `1e-6` для арифметического шума.
- **[Enemy у края может визуально скользить дольше]** → сохраняется tangent, outward normal
  удаляется, inward AI motion разрешён следующим tick; deterministic multi-tick tests исключают
  зависание.
- **[Hazard hit на границе потеряется при раннем cleanup]** → collision выполняется до cleanup и
  проверяется swept regression test.
- **[Постоянные asteroids не дадут закончить wave]** → completion учитывает только wave-origin
  asteroids, а ambient stream очищается при входе в intermission.
- **[Постоянные asteroids не дадут закончить wave]** → completion учитывает только wave-origin
  asteroids, а ambient stream очищается при входе в intermission.
- **[v10 комнаты несовместимы]** → server/display/controllers деплоятся одновременно; v10 получает
  `protocol_mismatch` до roster/watermark/world mutation.

## Migration Plan

1. Ввести pure geometry/config/core tests.
2. Поднять protocol до v11 и обновить server StateView/projection.
3. Обновить display adapter/renderer, controller envelopes/fixtures и rotation storage `.v1→.v2`.
4. Запустить package tests, room/network/Playwright, benchmark, `pnpm check` и `pnpm spec:validate`.
5. Одновременно перезапустить server/display/controller; rollback выполняется возвратом всего
   coherent commit, существующие v10 rooms не мигрируют.

## Open Questions

Нет material blockers. Radius/cleanup/edge behavior являются reversible tuning/config decisions;
новые gameplay systems в change не входят.
