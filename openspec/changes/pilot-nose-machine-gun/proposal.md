## Why

Сейчас pilot отвечает только за позиционирование, а всё огневое давление лежит на gunner'е. Носовой
пулемёт под управлением пилота даёт экипажу второй независимый источник огня и делает роль пилота
одновременно мобильной и наступательной: корабль летит туда, куда ведёт левый стик, и стреляет из
носа, пока пилот держит спуск.

## What Changes

- **BREAKING**: protocol version 11 → 12. `pilot:input` получает обязательное поле `mgFiring`; old
  clients получают существующий `protocol_mismatch`.
- Game-core: у корабля появляется trusted heading (нос). Ненулевой movement vector пилота задаёт
  target heading с плавным shortest-arc traverse; при нулевом входе target сохраняется (latched),
  current angle не прыгает.
- Game-core: носовой пулемёт. Hold `mgFiring=true` стреляет быстрыми слабыми снарядами строго из
  носа по current heading с authoritative cooldown, queued rising edge и общим friendly projectile
  cap. Модель перегрева: каждый выстрел греет MG, без выстрела он остывает; при полном нагреве
  lockout до rearm-порога (гистерезис).
- Protocol: `publicSpaceshipView` публикует `heading`; новый machineGun view
  `{heat, capacity, overheated}` в game snapshot; у friendly projectiles появляется опциональный
  `source` (`cannon`/`machineGun`) для различимого рендера.
- Server room: `handlePilotInput` передаёт `mgFiring`; disconnect и combat→intermission
  neutralization отменяют MG fire/target по существующим trusted core transitions; sequence
  watermark остаётся одним потоком на `pilot:input`.
- Controller пилота: правая hold-зона «ОГОНЬ» (touch/pointer) + Space как desktop hold-fire, шкала
  перегрева из authoritative snapshot и overheat-состояние кнопки; blur/visibilitychange/reconnect
  нейтрализуют movement и `mgFiring`.
- Display: корпус корабля получает носовой маркер/ствол MG, вращаемый по published heading через
  angle transition; снаряды пулемёта рисуются отличимым цветом/размером.

Не входят: upgrade cards для пулемёта (отдельный change), отдельный message type для MG, изменение
economy/credits, новые enemy archetypes, true 3D.

## Capabilities

### New Capabilities

Отсутствуют: поведение полностью описывается изменением существующих capabilities.

### Modified Capabilities

- `three-role-controls`: pilot получает второй hold-контрол (спуск MG), Space как desktop fire key,
  шкалу перегрева и overheat sync; правила neutralization/blur/reconnect расширяются на `mgFiring`.
- `spaceship-simulation`: новый trusted heading корабля с traverse от movement input; правила огня
  носового пулемёта (cooldown, queued edge, spawn из носа), модель heat/overheat/rearm и их
  stale/disconnect/intermission поведение.
- `authoritative-space-combat`: снаряды MG — friendly projectiles в тех же collision/damage/caps
  правилах; cap-занятость одинаково ограничивает оба оружия.

## Impact

- `packages/protocol`: PROTOCOL_VERSION 12, строгие schemas pilot input/spaceship/machineGun/
  projectile view (breaking для v11 clients).
- `packages/game-core`: config + validation новых MG/heading полей, state fields, pure transitions в
  `advanceSpaceshipSimulation`, новые cancel/neutralize функции; детерминированные тесты.
- `apps/server`: wiring `mgFiring` в room handler и neutralization paths, projection heading/
  machineGun/source в display/controller snapshots; room-level тесты.
- `apps/controller`: второй hold-контрол пилота, Space binding, heat gauge UI, overheat sync,
  blur/reconnect neutralization; unit/UI тесты.
- `apps/display`: рендер heading/носа и снарядов MG, view-model mapping; display тесты.
- `docs/GAME_DESIGN_DOCUMENT.md`, `docs/PROJECT_PLAN.md`: роль пилота с пулемётом, protocol v12.
- Активный change `visible-demo-harness` не конфликтует: он не меняет protocol и gameplay contracts.
