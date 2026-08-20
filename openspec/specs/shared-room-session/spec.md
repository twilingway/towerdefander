# shared-room-session Specification

## Purpose

TBD - created by archiving change bootstrap-network-vertical-slice. Update Purpose after archive.

## Requirements

### Requirement: Общий экран создаёт комнату летящего замка

Display SHALL создавать комнату protocol v6 с тремя controller slots и публиковать roomId, ссылку и
QR-код. Свежий display SHALL быть единственным владельцем display slot; повторное display-соединение
допускается только через reconnect или после освобождения slot.

#### Scenario: Display создаёт комнату

- **WHEN** display создаёт комнату с protocolVersion 6 и role `display`
- **THEN** сервер создаёт lobby с ролями `pilot`, `gunner`, `shield`

#### Scenario: Устаревший клиент подключается к v5

- **WHEN** create или join options содержат protocolVersion 5
- **THEN** сервер отклоняет соединение стабильной ошибкой `protocol_mismatch`

### Requirement: Сервер запускает матч после готовности трёх ролей

Server SHALL запускать simulation только когда pilot, gunner и shield подключены и каждый ready.
Strict `controller:ready` SHALL содержать protocolVersion, roomId и playerId; server SHALL сверять
actor и принимать его только в lobby. Ready повторяем и идемпотентен. После старта свежий controller
может занять только истёкшую свободную role и становится ready автоматически.

#### Scenario: Не все роли готовы

- **WHEN** подключены три игрока, но ready только два
- **THEN** phase остаётся `lobby`

#### Scenario: Все роли готовы

- **WHEN** третья занятая role становится ready
- **THEN** phase становится `active`, создаётся flying-castle state и запускается fixed-step timer

#### Scenario: Ready повторён в lobby

- **WHEN** тот же controller повторяет valid `controller:ready`
- **THEN** ready остаётся true без второго transition

#### Scenario: Ready отправлен после старта

- **WHEN** controller отправляет `controller:ready` в active phase
- **THEN** server возвращает `invalid_phase` и world не изменяется

### Requirement: Краткий разрыв сохраняет identity и role

Server SHALL разрешать controller и display reconnect в течение 30 секунд. Во время controller grace
player остаётся в roster с `connected=false`; после expiry запись удаляется, role освобождается, а
active simulation продолжает работать с безопасным stale-input behavior. Если display не
восстановился до expiry, server SHALL остановить simulation, закрыть оставшиеся connections и
dispose room, поскольку в первом slice нет terminal result и никто не может наблюдать session.
Consented controller leave SHALL немедленно освободить role, потому что клиент явно отказался от
reconnect; 30-second reservation применяется только к неожиданному разрыву.

#### Scenario: Controller осознанно покинул комнату

- **WHEN** active controller выполняет consented leave
- **THEN** server немедленно освобождает role для replacement

#### Scenario: Pilot вернулся в grace period

- **WHEN** pilot reconnect завершается до 30 секунд
- **THEN** playerId, role, ready и текущий world сохраняются

#### Scenario: Gunner не вернулся

- **WHEN** grace period gunner истёк
- **THEN** gunner role освобождается для replacement, а мир не пересоздаётся

#### Scenario: Display не вернулся

- **WHEN** 30-second grace period display истёк
- **THEN** server останавливает simulation и dispose room, а controllers возвращаются на join screen

### Requirement: Симуляция живёт независимо от controller transport

После старта server SHALL выполнять fixed step пока room существует, даже если один или все
controllers временно отключены. В первом slice отсутствует автоматический victory/defeat terminal
result.

#### Scenario: Все controllers временно отключены

- **WHEN** active room теряет три controller connections
- **THEN** simulation tick продолжает увеличиваться, а stale inputs переводят системы в безопасное
  состояние

### Requirement: Клиенты получают строгие v6 projections

Protocol SHALL определять отдельные strict `DisplayRoomView` и `ControllerRoomView`. Обе game
projections SHALL публиковать shield `{angle,active,energy,capacity}` с конечными числами и
invariant `0 <= energy <= capacity`. Display view SHALL дополнительно содержать projectiles и
obstacles; controller view SHALL их omit. Display и controller SHALL получать один authoritative
energy level.

#### Scenario: Щит расходует энергию

- **WHEN** active shield проходит один simulation step
- **THEN** display и все controllers получают одинаковое уменьшенное energy и unchanged capacity

#### Scenario: Display получает snapshot

- **WHEN** active state публикуется display
- **THEN** view содержит world, castle, turret, shield energy, obstacles и projectiles

#### Scenario: Некорректная энергия

- **WHEN** adapter пытается построить view с energy меньше нуля либо больше capacity
- **THEN** strict v6 schema отклоняет view

#### Scenario: Controller получает snapshot

- **WHEN** active state публикуется controller
- **THEN** view содержит shield energy и role state, но не содержит projectiles или obstacles

### Requirement: Сервер валидирует v6 messages до mutation

Create/join options и сообщения SHALL быть strict и содержать protocolVersion 6. Проверка SHALL идти
в порядке protocol, schema, connection role, roomId/playerId, assigned gameplay role, active phase,
sequence и только затем mutation. Ошибка SHALL отправляться только actor. Duplicate/out-of-order
absolute shield input SHALL быть idempotent и SHALL NOT изменять energy вне authoritative tick.

#### Scenario: Неизвестное поле в input

- **WHEN** controller отправляет v6 `shield:input` с лишним полем
- **THEN** server возвращает `invalid_message` и не изменяет aim, active или energy

#### Scenario: Shield input повторён

- **WHEN** server повторно получает уже принятую sequence
- **THEN** packet игнорируется, а energy изменяется только следующим simulation step

#### Scenario: Display отправляет gameplay intent

- **WHEN** display отправляет v6 `pilot:input`
- **THEN** server возвращает `not_controller` и не изменяет state

#### Scenario: Gameplay input отправлен в lobby

- **WHEN** controller отправляет valid v6 role input до старта
- **THEN** server возвращает `invalid_phase`, не записывает sequence и не создаёт world
