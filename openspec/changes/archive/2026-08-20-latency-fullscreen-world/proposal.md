## Why

Текущий общий экран уже заполняет viewport, но камера остаётся слишком близкой и использует неверную
для Phaser zoom интерпретацию scroll, поэтому у границы карты корабль прижимается к краю или
пропадает. Локальный ping каждого браузера также не позволяет общему экрану показать качество
соединения всего экипажа.

## What Changes

- **BREAKING** Protocol повышается с v6 до v7: server-driven latency probe/pong и server-owned RTT
  добавляются в strict messages и обе StateView projections; v6 create/join/messages отклоняются как
  `protocol_mismatch`.
- Общий экран показывает ping своего display connection и каждого занятого crew slot; controller
  показывает собственный server-measured ping.
- Server раз в две секунды измеряет RTT каждого connection, хранит ограниченную историю samples и
  сбрасывает telemetry при timeout/disconnect/reconnect. Метрика не влияет на gameplay.
- Базовый обзор отдаляется с `1280×720` до `1600×900` world units. Responsive viewport продолжает
  расширять обзор по одной оси без растяжения объектов.
- Camera scroll учитывает различие renderer pixels и logical world size при zoom. Camera bounds
  получают вычисляемый космический overscan, поэтому корабль, башня и shield arc остаются не ближе
  160 экранных пикселей к краю viewport в любой достижимой позиции.
- Сохраняются уже реализованные изменения change: мир `4800×3200`, ускорение angular controls на
  30%, fullscreen HUD overlays и видимая дуга выключенного щита.
- Runtime admin panel, автоматический вертикальный scroll и Tyrian-style combat/content остаются
  следующими этапами.

## Capabilities

### New Capabilities

- `connection-latency-diagnostics`: server-measured RTT display/controllers и его room UI.

### Modified Capabilities

- `shared-room-session`: protocol v7 handshake, strict probe/pong и latency fields в projections.
- `flying-castle-simulation`: размеры мира и ускоренные на 30% angular defaults.
- `primitive-top-down-battlefield`: дальний fullscreen viewport, zoom-correct camera, safe edge
  framing и видимый выключенный щит.

## Impact

Затрагиваются `packages/protocol`, Colyseus room/state и tests, display/controller adapters и React
UI, Phaser camera math, browser/network smoke tests и документация. Старые v6 clients несовместимы с
v7 server; все приложения monorepo обновляются атомарно. Новые зависимости не добавляются.
