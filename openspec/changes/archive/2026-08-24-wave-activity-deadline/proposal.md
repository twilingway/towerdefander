## Why

Бесконечный соревновательный run не должен завершаться из-за короткого room TTL, пока команда
успешно проходит волны. Одновременно зависшая или намеренно затянутая волна не должна удерживать
серверную комнату бесконечно.

## What Changes

- Каждая новая combat wave получает отдельный server-authoritative deadline: default 20 минут,
  конфигурируемый operator в диапазоне 1 секунда..24 часа.
- Успешный переход к следующей волне создаёт новый полный deadline; intermission, inputs и reconnect
  не продлевают текущий deadline.
- Истечение deadline завершает run как frozen `defeat` с причиной `wave_timeout`, после чего команда
  имеет существующие 10 минут на единогласный rematch либо выход.
- Display и controllers показывают authoritative остаток времени и корректную причину поражения.
- Default hard lifetime комнаты увеличивается с 4 до 12 часов и по-прежнему никогда не сбрасывается.
- **BREAKING**: protocol v12 повышается до v13 из-за новых полей countdown и defeat reason; server,
  display и controllers должны обновляться вместе по существующей hard-cut политике.
- Существующие lobby TTL 15 минут, zero-controller TTL 5 минут, result TTL 10 минут и reconnect
  grace 30 секунд сохраняются.

Не входит в change: leaderboard persistence, сохранение счёта после hard-cap disposal, динамическое
ускорение врагов перед timeout, pause gameplay и изменение наград/сложности волн.

## Capabilities

### New Capabilities

Нет.

### Modified Capabilities

- `wave-campaign`: ограничение длительности каждой combat wave и server-authoritative timeout
  defeat.
- `run-rematch-lifecycle`: 12-часовой несбрасываемый hard cap и взаимодействие wave deadline с
  result/rematch.
- `shared-room-session`: публикация countdown/defeat reason и поведение при reconnect.
- `primitive-top-down-battlefield`: отображение таймера и причины поражения на общем display.
- `three-role-controls`: отображение таймера и причины поражения на controller-клиентах.

## Impact

- `packages/protocol`: protocol v13, strict projections и defeat reason.
- `packages/game-core`: чистый переход combat state в timeout defeat без wall-clock timers.
- `apps/server`: отдельный wave deadline, конфигурация TTL, lifecycle и reconnect/rematch.
- `apps/display`, `apps/controller`: countdown и timeout-result UX.
- `.env.example`, GDD, README и автоматические lifecycle/protocol/UI tests.
- Новых runtime dependencies и изменений deployment topology нет.
