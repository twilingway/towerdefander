## 1. Protocol и pure core

- [x] 1.1 Обновить strict protocol до v13: `waveSecondsRemaining`, `defeatReason` и связанные
      invariants; проверить `pnpm --filter @spaceship-defender/protocol test`.
- [x] 1.2 Добавить pure timeout transition с сохранением hull/счёта/entities и тестами обеих причин
      defeat; проверить `pnpm --filter @spaceship-defender/game-core test`.

## 2. Authoritative server lifecycle

- [x] 2.1 Добавить конфигурацию 20-минутного wave TTL и изменить default hard cap на 12 часов вместе
      с `.env.example`; проверить server config tests.
- [x] 2.2 Реализовать отдельный generation-safe wave deadline, reset на каждой новой combat wave и
      cleanup при intermission/result/disposal.
- [x] 2.3 Покрыть timeout boundary, reconnect, rematch, неизменность hard cap и result TTL
      room-level тестами; проверить `pnpm --filter @spaceship-defender/server test`.

## 3. Клиентский UX

- [x] 3.1 Показать authoritative countdown и timeout reason на общем display; проверить display unit
      tests.
- [x] 3.2 Показать тот же countdown и timeout reason на всех role controllers; проверить controller
      unit tests.

## 4. Документация и интеграционная проверка

- [x] 4.1 Обновить GDD, README и конфигурационные примеры: wave deadline 20 минут, result 10 минут,
      hard cap 12 часов.
- [x] 4.2 Проверить network/E2E flows, `pnpm check`, `pnpm spec:validate` и согласовать выполненные
      tasks с результатами.
- [x] 4.3 Провести read-only reviewer audit authority, reconnect, timer cleanup и protocol
      compatibility без blocker/high/medium findings.
