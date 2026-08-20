## Why

Пушка и сектор щита сейчас мгновенно принимают направление стика, поэтому управление выглядит резким
и не передаёт ощущение тяжёлых механизмов летающего замка. Нужен серверный плавный доворот с
инерцией, похожий на вращение башни танка, без изменения уже понятных жестов контроллера.

## What Changes

- Ненулевой aim остаётся абсолютным целевым направлением, но turret и shield sector разгоняются,
  поворачиваются по кратчайшей дуге и тормозят у цели без overshoot.
- После первого ручного playtest тяжёлая настройка turret: максимум 60°/s, acceleration 120°/s² и
  braking 180°/s²; shield: максимум 75°/s, acceleration 150°/s² и braking 225°/s² при fixed step 50
  ms. Детерминированный разворот на 180° занимает 3,3 s для turret и 2,7 s для shield.
- Короткий tap сохраняет target bearing до завершения поворота; transport-neutral zero не отменяет
  цель. Stale input и disconnect являются trusted cancellation: цель сбрасывается, angular velocity
  плавно тормозит до нуля, reconnect не восстанавливает старую цель.
- Projectile использует текущий authoritative turret angle на fire tick, а не ещё не достигнутый
  target. Shield разрешено предварительно направлять в выключенном состоянии.
- Display продолжает только интерполировать authoritative angles и получает тесты перехода через ±π
  и одинаковой elapsed-time trajectory при 60/120 Hz.
- Protocol остаётся v6: message/view shape не меняется, target angle и angular velocity остаются
  внутренним состоянием game-core.
- Новые production dependencies, enemies, damage, relative left/right traverse, зависимость скорости
  от величины отклонения стика, controller-side prediction и финальный art не входят в change.

## Capabilities

### New Capabilities

Нет.

### Modified Capabilities

- `flying-castle-simulation`: authoritative target angles, angular acceleration/braking,
  shortest-arc traverse, stale/disconnect cancellation и current-angle firing.
- `three-role-controls`: absolute bearing gestures, tap completion, duplicate/reconnect semantics.
- `primitive-top-down-battlefield`: shortest-arc angular interpolation, wrap и hydration behavior.

## Impact

- `packages/game-core`: config/state angular fields, pure traverse helpers и deterministic tests.
- `apps/server`: trusted disconnect cancellation и room-level verification; public schema shape не
  меняется.
- `apps/controller`: текущий virtual stick и keyboard mapping сохраняются; добавляются regression
  tests без локального trusted easing.
- `apps/display`: angle interpolation tests и при необходимости небольшая нормализация render path.
- Compatibility: текущие protocol v6 display/controller клиенты остаются совместимыми; deployment и
  Android TV shell не меняются.
