# room-operations-dashboard Specification

## Purpose
TBD - created by archiving change room-rematch-lifecycle-stats. Update Purpose after archive.
## Requirements
### Requirement: Страница показывает безопасную статистику активных комнат

Server SHALL предоставлять read-only HTML `/stats/rooms` и JSON `/stats/rooms.json`, построенные из
Colyseus room metadata. Ответ SHALL содержать timestamp, total rooms, connected controller players,
counts по status и анонимные rows только с status, connectedPlayers, reservedPlayers, capacity,
ageSeconds и expiresInSeconds|null. Display SHALL NOT учитываться как player. RoomId/join code,
player/session identity, name, IP, reconnect token, latency, endpoint, seed и gameplay entities
SHALL NOT попадать в metadata или response. Ответ SHALL иметь `Cache-Control: no-store`.

#### Scenario: Сервер имеет несколько комнат

- **WHEN** существуют lobby с двумя controllers, combat с тремя и result с одним reserved controller
- **THEN** page/json показывают три анонимные строки, корректные status/counts и aggregate players

#### Scenario: Комната уничтожена

- **WHEN** room disposed и следующий stats refresh выполняется
- **THEN** её row и contribution исчезают из ответа

#### Scenario: Ответ проверяется на персональные данные

- **WHEN** тест сериализует metadata, JSON и HTML при известных roomId/name/sessionId/seed
- **THEN** ни одно известное секретное или персональное значение не присутствует

### Requirement: Удалённый доступ к статистике закрыт по умолчанию

Без `ROOM_STATS_PASSWORD` server SHALL разрешать stats endpoints только loopback socket addresses и
SHALL NOT доверять `X-Forwarded-For`. При заданном password server SHALL требовать HTTP Basic
credentials `admin:<password>` и сравнивать secret безопасно; deployment SHALL использовать TLS
reverse proxy для удалённого доступа. Unauthorized ответ SHALL быть 401 без operational data. Stats
query failure SHALL вернуть 503 без stack trace и SHALL NOT влиять на gameplay rooms.

#### Scenario: Localhost открывает страницу без password

- **WHEN** password отсутствует и request socket имеет loopback address
- **THEN** server возвращает statistics page

#### Scenario: LAN-клиент открывает страницу без password

- **WHEN** password отсутствует и socket address не loopback, даже с loopback X-Forwarded-For
- **THEN** server возвращает 401 без room counts

#### Scenario: Удалённый оператор вводит password

- **WHEN** password настроен и request содержит правильный Basic credential
- **THEN** server возвращает страницу, а неправильный credential получает 401

#### Scenario: Driver statistics недоступна

- **WHEN** Colyseus room query завершается ошибкой
- **THEN** stats endpoint возвращает 503 без stack trace, а активная simulation продолжает ticks

### Requirement: Monitoring metadata остаётся компактной и актуальной

Каждая room SHALL публиковать только неперсональные metadata при create, status/membership/deadline
transition и SHALL удалять/переставать публиковать её при disposal. Concurrent updates SHALL быть
упорядочены или coalesced так, чтобы позднее завершившаяся старая запись не перезаписала новый
status. Stats page SHALL обновляться не чаще одного раза в 5 секунд; monitoring failure SHALL быть
изолирована от room lifecycle и gameplay authority.

#### Scenario: Combat переходит в intermission

- **WHEN** status быстро меняется combat → intermission во время предыдущей metadata write
- **THEN** следующий query наблюдает intermission, а не восстановленный stale combat

#### Scenario: Браузер держит stats page открытой

- **WHEN** page работает одну минуту
- **THEN** она выполняет не более 13 JSON requests и не создаёт gameplay WebSocket
