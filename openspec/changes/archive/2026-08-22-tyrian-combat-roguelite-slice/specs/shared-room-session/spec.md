## REMOVED Requirements

### Requirement: Общий экран создаёт комнату летящего замка

**Reason**: Protocol v7 room contract заменён strict protocol v8 combat room contract.

**Migration**: Display и controllers одновременно переходят на protocol v8; v7 handshake получает
`protocol_mismatch`.

### Requirement: Клиенты получают строгие v7 projections

**Reason**: Combat entities, encounter, HP и personalized upgrades требуют нового strict v8 view.

**Migration**: Display и controller adapters переходят на отдельные v8 projections одновременно с
server state.

### Requirement: Сервер валидирует v7 messages до mutation

**Reason**: Protocol v8 добавляет combat phases, upgrade command и расширенный validation pipeline.

**Migration**: Все v7 messages отклоняются `protocol_mismatch`; v8 clients используют новые strict
schemas.

## ADDED Requirements

### Requirement: Общий экран создаёт protocol v8 комнату летящего замка

Display SHALL создавать комнату protocol v8 с тремя controller slots и публиковать roomId, ссылку и
QR-код. Свежий display SHALL быть единственным владельцем display slot; повторное display-соединение
допускается только через reconnect или после освобождения slot.

#### Scenario: Display создаёт protocol v8 комнату

- **WHEN** display создаёт комнату с protocolVersion 8 и role `display`
- **THEN** сервер создаёт lobby с ролями `pilot`, `gunner`, `shield`

#### Scenario: Клиент protocol v7 подключается к v8

- **WHEN** create или join options содержат protocolVersion 7
- **THEN** сервер отклоняет соединение стабильной ошибкой `protocol_mismatch`

## MODIFIED Requirements

### Requirement: Симуляция живёт независимо от controller transport

После старта server SHALL выполнять fixed step пока room существует, даже если один или все
controllers временно отключены. Combat/intermission SHALL продолжать authoritative encounter time, а
stale/disconnected controls SHALL нейтрализоваться. При `defeated` fixed-step timer MAY продолжать
room clock/latency lifecycle, но combat state SHALL оставаться frozen и новые spawns/damage SHALL
быть запрещены.

#### Scenario: Все controllers временно отключены

- **WHEN** active combat room теряет три controller connections
- **THEN** simulation tick и encounter продолжаются, а stale inputs переводят системы в безопасное
  состояние

#### Scenario: Controllers отключены в intermission

- **WHEN** intermission deadline наступает без подключённых controllers
- **THEN** deterministic fallbacks применяются к трём ролям и следующая wave начинается

#### Scenario: Run завершён поражением

- **WHEN** encounter имеет phase defeated
- **THEN** reconnect видит сохранённый final result, а combat entities/HP больше не мутируют

## ADDED Requirements

### Requirement: Клиенты получают строгие v8 projections

Protocol SHALL определять отдельные strict v8 `DisplayRoomView` и personalized `ControllerRoomView`.
Обе game projections SHALL публиковать encounter summary, castle current/max HP, wave/score, shield
`{angle,active,energy,capacity}`, role modifiers и room latency state. Display view SHALL
дополнительно содержать stable enemies, asteroids, friendly/hostile bullets, homing missiles и
obstacles. Controller view SHALL omit mass entity transforms/obstacles и SHALL содержать только
offer/selection assigned actor role. Display и controller SHALL получать один authoritative HP,
energy, encounter и applied modifiers state.

Cross-field validation SHALL требовать unique entity IDs/spawn sequence, finite transforms,
`0<=HP<=maxHP`, `0<=energy<=capacity`, type/total caps и phase invariants: lobby game null; active
game non-null; combat без upgrade offers; intermission с current offers/selections и без hostile
entities; defeated без offers и с HP=0.

#### Scenario: Display получает combat snapshot

- **WHEN** active encounter имеет gunship, asteroid, hostile bullet и missile
- **THEN** display view содержит все четыре stable entities, encounter/wave, HP, shield и latency

#### Scenario: Controller получает combat snapshot

- **WHEN** gunner получает тот же room state
- **THEN** controller view содержит HP/wave/phase/modifiers, но не содержит enemies, asteroids,
  projectiles, missiles или obstacles

#### Scenario: Controller получает intermission snapshot

- **WHEN** pilot подключён во время intermission
- **THEN** его view содержит только pilot offers/selection и не раскрывает gunner/shield offers

#### Scenario: Некорректный combat view

- **WHEN** adapter строит snapshot с HP больше maxHP, duplicate entity ID либо entity count выше cap
- **THEN** strict v8 schema отклоняет весь view

#### Scenario: Некорректная энергия или ping

- **WHEN** adapter строит view с energy вне `0..capacity` либо latency дробной/вне `0..5000`
- **THEN** strict v8 schema отклоняет весь view

### Requirement: Сервер валидирует v8 messages до mutation

Create/join options и сообщения SHALL быть strict и содержать protocolVersion 8. Continuous gameplay
проверка SHALL идти в порядке protocol, schema, connection role, roomId/playerId, assigned gameplay
role, encounter combat phase, sequence и только затем mutation. Upgrade choice SHALL проверять
protocol/schema и controller identity, затем action journal/fingerprint, затем assigned role,
intermission/current wave/offer/selection до atomic modifier mutation. Latency pong SHALL проверять
protocol, schema, connection membership, roomId и ownership outstanding probeId. Ошибка SHALL
отправляться только actor. Duplicate/out-of- order continuous input SHALL быть idempotent и SHALL
NOT изменять energy/damage вне authoritative tick.

#### Scenario: Неизвестное поле в input

- **WHEN** controller отправляет v8 `shield:input` с лишним полем
- **THEN** server возвращает `invalid_message` и не изменяет aim, active, energy или combat state

#### Scenario: Shield input повторён

- **WHEN** server повторно получает уже принятую sequence
- **THEN** packet игнорируется, а energy/damage изменяются только authoritative simulation step

#### Scenario: Display отправляет gameplay intent

- **WHEN** display отправляет v8 `pilot:input` либо `upgrade:choose`
- **THEN** server возвращает `not_controller` и не изменяет state

#### Scenario: Gameplay input отправлен вне combat

- **WHEN** controller отправляет valid role input в lobby, intermission либо defeated encounter
- **THEN** server возвращает `invalid_phase`, не записывает sequence и не изменяет world

#### Scenario: Upgrade отправлен вне intermission

- **WHEN** controller отправляет valid current-shape `upgrade:choose` с ранее неизвестным actionId в
  combat либо defeated
- **THEN** server возвращает `invalid_phase`, не записывает actionId и не меняет modifiers

#### Scenario: Display отвечает на latency probe

- **WHEN** display отправляет strict v8 pong для своего outstanding probeId
- **THEN** server обновляет только display latency telemetry и не требует controller role/playerId

## ADDED Requirements

### Requirement: Defeated run допускает только reconnect

После `defeated` server SHALL сохранять зарезервированные identities в существующий grace period и
разрешать их reconnect к final snapshot. Fresh controller SHALL NOT занимать пустую/истёкшую role в
defeated run. Display reconnect/disposal SHALL следовать прежнему 30-second lifecycle.

#### Scenario: Зарезервированный pilot возвращается после defeat

- **WHEN** прежний pilot reconnect выполняется до expiry
- **THEN** identity/role восстанавливаются и controller получает frozen final result

#### Scenario: Новый controller входит после defeat

- **WHEN** fresh controller пытается занять свободную role defeated run
- **THEN** server отклоняет join стабильной ошибкой `invalid_phase` и final state не меняется
