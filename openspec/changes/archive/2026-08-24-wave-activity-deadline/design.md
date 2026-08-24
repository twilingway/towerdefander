## Context

Текущий server lifecycle закрывает любую комнату через четыре часа, даже если экипаж продолжает
успешный бесконечный run. При этом сама combat wave не имеет wall-clock ограничения. Изменение
затрагивает pure game-core transition, Colyseus room timers, strict protocol projections и UI двух
клиентов.

## Goals / Non-Goals

**Goals:**

- дать каждой combat wave 20 минут реального серверного времени;
- публиковать единый authoritative countdown и точную причину поражения;
- сохранить result/rematch/reconnect и защиту от утечек комнаты;
- увеличить, но не отменить несбрасываемый hard cap комнаты.

**Non-Goals:**

- persistence счёта и leaderboard;
- pause, enrage либо динамическое изменение сложности перед deadline;
- изменение rewards, wave budget или room statistics API;
- сохранение результата при принудительном 12-часовом disposal.

## Decisions

### Отдельный server-owned wave deadline

Room хранит `waveDeadlineAtMs`, generation и timer отдельно от closing deadlines. Deadline создаётся
при входе в каждую combat wave, очищается при intermission/result/disposal и не продлевается от
inputs, reconnect или upgrade choice. Это не элемент `lifecycleDeadlines`, потому что его истечение
сначала создаёт result, а не закрывает комнату; operational `expiresAtMs` продолжает означать
ближайшее реальное закрытие.

Альтернатива — считать только simulation ticks — отклонена: browser/server sleep или event-loop
stall могли бы фактически растянуть 20 минут. Клиентский таймер также отклонён как неавторитетный.

### Чистый timeout transition в game-core

Wall clock остаётся в server room. При истечении сервер вызывает чистую функцию game-core, которая
переводит только текущий combat state в frozen `result/defeat` с `defeatReason=wave_timeout`,
сохраняя фактический hull и сущности. Обычное уничтожение использует
`defeatReason=spaceship_destroyed` и сохраняет существующий инвариант hull=0.

Перед каждым combat step room проверяет deadline. Если deadline уже наступил, новый simulation step
не применяется. Если предыдущий допустимый step уничтожил последнюю wave-угрозу, transition в
intermission уже очистил deadline и волна считается завершённой.

### Protocol v13 и публичный countdown

`PublicEncounterView` получает `waveSecondsRemaining` и nullable `defeatReason`. В combat countdown
находится в диапазоне `1..86400`: default `ROOM_WAVE_TTL_SECONDS` равен 1200, но operator может
настроить срок до 24 часов. Вне combat countdown равен нулю. Result/defeat требует одну из известных
причин; non-result и victory не публикуют defeat reason. Server обновляет значение только при смене
целой секунды, оба projection получают одинаковые данные.

Это hard-cut upgrade v12 → v13: старые клиенты получают существующий `protocol_mismatch`. Adapter,
server, display и controllers выкатываются вместе; dual-protocol migration не вводится.

### 12-часовой hard cap остаётся настоящим absolute deadline

`ROOM_ABSOLUTE_TTL_SECONDS` получает default 43200. Timestamp создаётся один раз в `onCreate` и не
меняется от wave transition либо rematch. Его истечение в любой phase сразу закрывает комнату с
`room_lifetime_expired`, как и раньше. При совпадении closing deadlines используется существующий
детерминированный priority.

## Risks / Trade-offs

- [Clock adjustment меняет wall-clock остаток] → deadline сравнивается и публикуется только
  сервером; проверки generation/epoch не дают старому callback завершить новую волну.
- [Дополнительный patch traffic] → публикуется целое число секунд, поэтому поле меняется не чаще
  раза в секунду и не влияет на Phaser render loop.
- [Hard cap обрывает активный run без persistence] → поведение явно остаётся safety-механизмом;
  сохранение leaderboard выносится в отдельный change.
- [v12 clients несовместимы] → применяется уже принятая hard-cut политика одновременного обновления.
- [Timer callback и fixed step приходят одновременно] → проверка expiry перед каждым step даёт
  timeout при `now >= deadline`; уже завершившийся предыдущий step сохраняет успех.

## Migration Plan

1. Обновить protocol и pure transition, затем server projections/timers.
2. Обновить display/controllers и strict fixtures.
3. Изменить environment example/default hard cap и документацию.
4. Выполнить protocol, core, room, UI, network и E2E проверки.
5. Разворачивать server и оба web clients одной версией. Rollback выполняется всей сборкой на v12.

## Open Questions

Нет блокирующих вопросов. Persistence результата при 12-часовом hard cap остаётся будущим change.
