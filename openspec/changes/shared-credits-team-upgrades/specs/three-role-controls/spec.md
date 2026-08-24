## MODIFIED Requirements

### Requirement: Role ограничивает допустимые intents

Pilot SHALL отправлять только `pilot:input` и свой role-owned `upgrade:vote`, gunner —
`gunner:input` и свой `upgrade:vote`, shield — `shield:input` и свой `upgrade:vote`. Server SHALL
сверять connection identity/role до mutation. Любая role MAY голосовать за любую из трёх cards
общего current offer, но SHALL изменять только vote своего role slot. Display SHALL NOT отправлять
gameplay либо vote intents.

#### Scenario: Shield пытается двигать spaceship

- **WHEN** shield controller отправляет strict pilot input
- **THEN** server возвращает `role_mismatch` и spaceship state не меняется

#### Scenario: Gunner голосует за shield upgrade

- **WHEN** gunner controller отправляет strict vote для current shield card
- **THEN** server изменяет только gunner vote и не применяет modifier до deadline

#### Scenario: Display отправляет role intent

- **WHEN** display отправляет известный gameplay либо `upgrade:vote` message
- **THEN** server возвращает `not_controller` и не меняет мир/economy

## ADDED Requirements

### Requirement: Controller показывает authoritative feedback голосования

Все controllers SHALL показывать одинаковые три cards, credits и публичные role votes. Card actor
SHALL иметь pending state только до authoritative vote с ожидаемым revision либо actor-only error.
Accepted vote SHALL подсвечиваться и оставаться изменяемым до deadline; rejection SHALL снимать
pending и оставлять controls доступными для исправленного command.

#### Scenario: Server отклонил поздний vote

- **WHEN** controller получает `invalid_phase`, `action_not_available` либо `stale_action` для
  pending action
- **THEN** pending снимается, показывается понятная ошибка и следующий доступный vote не блокируется

#### Scenario: Другой игрок изменил голос

- **WHEN** shared projection меняет vote другой role
- **THEN** controller обновляет счётчики/маркеры без изменения собственного pending action
