## ADDED Requirements

### Requirement: Display различает score, credits и командное голосование

React HUD общего display SHALL во всех active phases отдельно показывать score и общий credits
balance. Во время intermission overlay SHALL показывать 30-секундный authoritative countdown, три
role cards с price, vote каждого role slot и правило tie resolution. Display SHALL быть read-only и
SHALL NOT отправлять vote либо оптимистически менять balance.

#### Scenario: Начался team-upgrade vote

- **WHEN** encounter входит в intermission с credits 7 и общим offer
- **THEN** display показывает `Счёт`, `Монеты: 7`, три cards по 5 и обновляемые голоса экипажа

#### Scenario: Purchase завершён

- **WHEN** deadline применил card и следующая wave началась
- **THEN** intermission overlay исчезает, HUD показывает authoritative остаток credits и новый
  modifier без локального списания
