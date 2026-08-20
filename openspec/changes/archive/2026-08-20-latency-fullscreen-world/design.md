## Context

Display и controllers работают через один Colyseus Room и protocol v6. Первый implementation pass
показывал только локальный `Room.ping`, поэтому display не видел RTT crew. Phaser `RESIZE` ввёл
zoom, но runtime передавал world-view top-left напрямую в `Camera.setScroll`; Phaser scroll хранится
в renderer-space до zoom correction, что систематически смещает camera midpoint. У world edge camera
также прижимает визуальную геометрию castle к экранной границе.

## Goals / Non-Goals

**Goals:**

- server-owned RTT display и каждого controller на общем экране;
- protocol v7 strict probe/pong и projection invariants;
- обзор `1600×900` с responsive расширением;
- zoom-correct centering и безопасная видимость castle у world edges;
- сохранить ранее принятые world/tuning/fullscreen/inactive-shield изменения.

**Non-Goals:**

- input-to-render acknowledgement и использование latency в simulation;
- IP/timestamps/input telemetry в public state;
- runtime admin panel;
- автоматический vertical scroll, enemies, combat и полная Tyrian 2000 loop;
- minimap, assets/dependencies и Android native changes.

## Decisions

### Protocol v7 и server-driven probes

`PROTOCOL_VERSION=7`. Server после join/reconnect и далее не чаще чем каждые 2000 ms отправляет
живому connection уникальный probeId и хранит `{probeId,sentAt}` отдельно для connection. Client
только валидирует envelope и немедленно echo через `client:latency-pong`; он не сообщает RTT. Server
вычисляет elapsed monotonic time, clamp до 5000 и median максимум пяти samples. One outstanding
probe per connection; в 5000 ms он expires, telemetry становится unknown, а unique ID делает поздний
pong безопасно игнорируемым.

Root schema хранит `displayLatencyMs:int32=-1`, `PlayerState` — `latencyMs:int32=-1`; adapters
преобразуют sentinel в public `number|null`. Оба strict room views принимают только integer
`0..5000|null`. Display получает все значения; controller UI использует sample текущего player.
Telemetry публична только внутри Room и не является trusted gameplay state.

Client references, scheduled probes, outstanding probes и histories принадлежат Room, удаляются при
leave/dispose и создаются заново после reconnect. Protocol/schema/room errors actor-only; valid
unknown/duplicate/late/cross-connection probe silently ignored. Rate limit остаётся 25/s, gameplay
scheduler — 20/s.

Rejected alternative: client-reported local `Room.ping` нельзя авторитетно показать другим
участникам и легко подделать. Applied-input acknowledgements измеряют другую метрику и остаются
follow-up.

### Дальний responsive viewport

Базовая logical area меняется на `1600×900`. Для actual renderer `W×H`: `zoom=min(W/1600,H/900)`,
logical dimensions равны `W/zoom × H/zoom`; поэтому ни одна базовая ось не обрезается, а лишняя ось
расширяется. Phaser scene остаётся `Scale.RESIZE` и не пересоздаёт Room.

### Zoom-correct camera scroll и edge overscan

Pure helper сначала вычисляет желаемый world-view top-left, затем преобразует его в Phaser scroll:

`scrollX = worldViewX - (rendererWidth - logicalWidth) / 2`

и аналогично Y. Это соответствует Phaser `midPoint = scroll + rendererSize/2` и устраняет смещение
при zoom, отличном от 1.

Visual envelope равен `castle.radius + 42` world units (shield radius и половина active stroke).
Требуемый space overscan на resize равен `visualEnvelope + 160/zoom`, чтобы вся геометрия оставалась
минимум в 160 CSS pixels от края. Camera bounds расширяются на overscan; at edge world-view MAY
показать ограниченный background space. Если viewport больше expanded world, helper центрирует мир,
а не прижимает его к top/left.

### Остальные принятые defaults

World остаётся `4800×3200`; angular coefficients остаются ускоренными на 30%; inactive shield
остаётся тонкой дугой. Admin panel не добавляется.

## Risks / Trade-offs

- [Protocol v7 ломает старые tabs] → все monorepo clients обновляются вместе, v6 получает явный
  `protocol_mismatch`, после restart создаётся новая room.
- [Telemetry patches вызывают render] → probe period 2 s, bounded state и простые derived labels;
  Phaser game snapshot не пересоздаётся из-за telemetry.
- [Overscan показывает область за картой] → единый space background и явная border grid; это лучше
  скрытого корабля и соответствует космической теме.
- [RTT не равен реакции] → UI пишет только `Пинг`/`До сервера`.
- [Server clock nondeterministic] → latency полностью вне pure game-core и gameplay state.

## Migration Plan

Protocol, server и оба clients выпускаются атомарно. Local rooms v6 закрываются server restart.
Rollback требует возврата protocol constant/state fields/messages и local-only monitor; persistent
room data отсутствует.

## Open Questions

После playtest отдельно решить, нужен ли Tyrian-style постоянный vertical scroll/dead-zone и
авторизованная admin panel runtime tuning.
