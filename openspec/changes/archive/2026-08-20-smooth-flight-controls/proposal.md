## Why

Первый ручной playtest выявил рывки замка и камеры, нестабильное управление пушкой от обычного
движения мыши и неудобную hold-модель щита. Базовое управление должно ощущаться плавным и
предсказуемым до добавления врагов и столкновений.

## What Changes

- Pilot получает server-authoritative ускорение и торможение вместо мгновенного переключения между
  нулевой и максимальной скоростью; display использует time-based smoothing без округления world
  coordinates до целых пикселей.
- Gunner и shield меняют направление только через активный drag/touch внутри virtual stick либо
  явный keyboard fallback; обычное движение мыши над controller больше не отправляет aim.
- Fire остаётся удерживаемым действием, но pointer capture/release отделяются от aim stick, чтобы
  нажатие в области кнопки не поворачивало пушку.
- Shield включается и выключается отдельным нажатием. Отпускание pointer/Space, blur и потеря
  visibility не выключают его; disconnect и reconnect transition сохраняют безопасное выключение.
- Server-authoritative shield energy расходуется только при реально активном щите и
  восстанавливается только при выключенном. После полного разряда controller подтверждает
  authoritative auto-OFF, а повторное включение требует нового ручного ON, что исключает мерцание.
- Shield config хранит max capacity, drain и recharge rates как основу будущих upgrades; controller
  и display показывают текущий запас.
- **BREAKING**: protocol повышается с v5 до v6, strict room views получают energy-поля щита, а
  `shield:input.active` меняет семантику hold на устойчивое абсолютное ON/OFF состояние.
- Новые production dependencies и изменения deployment отсутствуют.

### Goals

- Сделать начало движения, остановку, камеру и world objects визуально плавными при 20 Hz server
  snapshots и разной частоте кадров display.
- Сделать aim предсказуемым для touch, pen и mouse drag, не связывая его с координатами всей панели.
- Добавить понятный toggle-щит с ограниченной энергией и детерминированным восстановлением.

### Non-goals

- Враги, урон, shield collisions, upgrades UI, persistence и баланс прогрессии.
- Client-authoritative physics, trusted prediction или изменение simulation tick rate.
- Финальные sprites, VFX и sound.

## Capabilities

### New Capabilities

Нет.

### Modified Capabilities

- `flying-castle-simulation`: ускорение/торможение замка и авторитетная модель энергии щита.
- `three-role-controls`: gesture-only aim, стабильный fire и toggle-семантика щита.
- `primitive-top-down-battlefield`: time-based smoothing замка, камеры, башни, щита и снарядов.
- `shared-room-session`: protocol v6 и строгая публикация shield energy в display/controller views.

## Impact

- `packages/game-core`: config/state/transitions и deterministic tests.
- `packages/protocol`: protocol v6, shield view и validation tests.
- `apps/server`: Colyseus schema projection, input neutralization и room tests.
- `apps/controller`: virtual-stick gesture boundary, fire pointer lifecycle, toggle button и energy
  HUD.
- `apps/display`: Phaser snapshot smoothing и shield energy HUD.
- Network smoke и Playwright flows обновляются под v6 и новое управление.
