## RENAMED Requirements

- FROM: `### Requirement: Клиенты получают строгие v5 projections`
- TO: `### Requirement: Клиенты получают строгие v6 projections`
- FROM: `### Requirement: Сервер валидирует v5 messages до mutation`
- TO: `### Requirement: Сервер валидирует v6 messages до mutation`

## MODIFIED Requirements

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
