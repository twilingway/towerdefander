## RENAMED Requirements

- FROM: `### Requirement: Protocol v10 публикует spaceship contract`
- TO: `### Requirement: Protocol v11 публикует spaceship contract`

## MODIFIED Requirements

### Requirement: Protocol v11 публикует spaceship contract

Strict protocol v11 SHALL использовать Colyseus room type `spaceship_defender`, общий exported
`ROOM_TYPE`, public fields `game.spaceship`/`game.arenaRadius` и schema/type `PublicSpaceshipView`.
Поле `game.castle`, старый room type и protocol v10 SHALL NOT приниматься server boundary. Display,
controllers, stats query и network scripts SHALL использовать один общий room type/protocol
contract.

#### Scenario: V10 display создаёт комнату

- **WHEN** display создаёт `spaceship_defender` с protocolVersion 11
- **THEN** server создаёт `SpaceshipDefenderRoom`, а strict snapshot содержит `game.spaceship`,
  `game.arenaRadius` и не содержит `game.castle`

#### Scenario: V9 клиент использует новый room type

- **WHEN** client создаёт, подключается либо отправляет gameplay message в `spaceship_defender` с
  protocolVersion 10
- **THEN** server возвращает `protocol_mismatch` до room/gameplay mutation

#### Scenario: Старый room type больше не зарегистрирован

- **WHEN** client пытается создать `town_defenders`
- **THEN** matchmaking завершается ошибкой без создания комнаты или gameplay state

#### Scenario: Старый reconnect token остался в browser storage

- **WHEN** controller v11 запускается с `spaceship-defender.controller-session.v1` либо legacy
  `town-defenders.controller-session.v1`
- **THEN** оба old records удаляются до `Client.reconnect`, новый join form не пытается восстановить
  v10 connection и v11 session сохраняется под `spaceship-defender.controller-session.v2`

### Requirement: Rename сохраняет server-authoritative gameplay

Переименование и circular migration SHALL NOT менять fixed-step timing, seeded RNG domains,
movement/rotation tuning, combat balance, roles, message ordering, idempotency,
reconnect/rematch/TTL либо StateView visibility, кроме явно принятой arena geometry/spawn/boundary
semantics. Одинаковые valid seed/input traces в v11 SHALL давать детерминированные numerical
outcomes.

#### Scenario: Детерминированный trace выполняется после rename

- **WHEN** core получает зафиксированные seed, circular config и sequence pilot/gunner/shield inputs
- **THEN** spaceship/enemies проходят повторяемые positions, shots, shield energy, damage, waves,
  score и result без несеянной случайности

#### Scenario: Полный browser flow работает с новым именем

- **WHEN** display и три controllers проходят join, movement, fire, shield, result и rematch
- **THEN** они остаются в одной `spaceship_defender` room, используют только v11 projections и не
  требуют legacy compatibility aliases
