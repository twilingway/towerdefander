## MODIFIED Requirements

### Requirement: Общий экран создаёт комнату летящего замка

Display SHALL создавать комнату protocol v7 с тремя controller slots и публиковать roomId, ссылку и
QR-код. Свежий display SHALL быть единственным владельцем display slot; повторное display-соединение
допускается только через reconnect или после освобождения slot.

#### Scenario: Display создаёт комнату

- **WHEN** display создаёт комнату с protocolVersion 7 и role `display`
- **THEN** сервер создаёт lobby с ролями `pilot`, `gunner`, `shield`

#### Scenario: Устаревший клиент подключается к v5

- **WHEN** create или join options содержат protocolVersion 6
- **THEN** сервер отклоняет соединение стабильной ошибкой `protocol_mismatch`

## REMOVED Requirements

### Requirement: Клиенты получают строгие v6 projections

**Reason**: Public room telemetry и protocol v7 заменяют v6 projections. **Migration**: Использовать
strict v7 views с nullable display/player latency fields.

### Requirement: Сервер валидирует v6 messages до mutation

**Reason**: Strict probe/pong и все gameplay messages переходят на protocol v7. **Migration**:
Обновить clients до v7; server отклоняет v6 через `protocol_mismatch`.

## ADDED Requirements

### Requirement: Клиенты получают строгие v7 projections

Protocol SHALL определять отдельные strict v7 `DisplayRoomView` и `ControllerRoomView`. Обе game
projections SHALL публиковать shield `{angle,active,energy,capacity}` с конечными числами и
invariant `0 <= energy <= capacity`. Обе room projections SHALL публиковать server-owned nullable
`displayLatencyMs` и player `latencyMs` как integer `0..5000` либо `null`. Display view SHALL
дополнительно содержать projectiles и obstacles; controller view SHALL их omit. Display и controller
SHALL получать один authoritative energy и latency state.

#### Scenario: Щит расходует энергию

- **WHEN** active shield проходит один simulation step
- **THEN** display и все controllers получают одинаковое уменьшенное energy и unchanged capacity

#### Scenario: Display получает snapshot

- **WHEN** active state публикуется display
- **THEN** view содержит world, castle, turret, shield energy, obstacles, projectiles,
  displayLatencyMs и latency каждого crew player

#### Scenario: Некорректная энергия

- **WHEN** adapter пытается построить view с energy меньше нуля либо больше capacity
- **THEN** strict v7 schema отклоняет view

#### Scenario: Controller получает snapshot

- **WHEN** active state публикуется controller
- **THEN** view содержит shield energy и room latency state, но не содержит projectiles или
  obstacles

#### Scenario: Некорректный ping

- **WHEN** adapter пытается построить view с latency дробной, меньше нуля либо больше 5000
- **THEN** strict v7 schema отклоняет view

### Requirement: Сервер валидирует v7 messages до mutation

Create/join options и сообщения SHALL быть strict и содержать protocolVersion 7. Проверка gameplay
SHALL идти в порядке protocol, schema, connection role, roomId/playerId, assigned gameplay role,
active phase, sequence и только затем mutation. Latency pong SHALL проверять protocol, schema,
connection membership, roomId и ownership outstanding probeId. Ошибка SHALL отправляться только
actor. Duplicate/out-of-order absolute shield input SHALL быть idempotent и SHALL NOT изменять
energy вне authoritative tick.

#### Scenario: Неизвестное поле в input

- **WHEN** controller отправляет v7 `shield:input` с лишним полем
- **THEN** server возвращает `invalid_message` и не изменяет aim, active или energy

#### Scenario: Shield input повторён

- **WHEN** server повторно получает уже принятую sequence
- **THEN** packet игнорируется, а energy изменяется только следующим simulation step

#### Scenario: Display отправляет gameplay intent

- **WHEN** display отправляет v7 `pilot:input`
- **THEN** server возвращает `not_controller` и не изменяет state

#### Scenario: Gameplay input отправлен в lobby

- **WHEN** controller отправляет valid v7 role input до старта
- **THEN** server возвращает `invalid_phase`, не записывает sequence и не создаёт world

#### Scenario: Display отвечает на latency probe

- **WHEN** display отправляет strict v7 pong для своего outstanding probeId
- **THEN** server обновляет только display latency telemetry и не требует controller role/playerId
