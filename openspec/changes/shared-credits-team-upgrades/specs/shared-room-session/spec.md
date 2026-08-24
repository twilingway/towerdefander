## ADDED Requirements

### Requirement: Protocol v14 публикует общую economy state и восстанавливает votes

Strict v14 display/controller projections SHALL одинаково публиковать score, credits, nullable
team-upgrade offer, три role votes и nullable purchase selection. Offer/votes SHALL существовать
только в intermission; combat/result SHALL не публиковать активный offer. Reconnect SHALL получать
current balance/offer/votes/countdown без продления intermission. v13 client SHALL получить
существующий `protocol_mismatch` и SHALL NOT войти в v14 room.

#### Scenario: Controller вернулся в intermission

- **WHEN** controller reconnect завершается до 30-секундного deadline
- **THEN** он получает тот же offer, актуальный countdown, все votes и revision своего role slot

#### Scenario: Replacement занял role

- **WHEN** reservation истекла и replacement получает role с существующим vote
- **THEN** projection показывает этот role vote, а replacement может заменить его большим revision

#### Scenario: Старый client подключается

- **WHEN** v13 display либо controller пытается войти в v14 room
- **THEN** server отклоняет join/command как `protocol_mismatch` без economy mutation
