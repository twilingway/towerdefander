## ADDED Requirements

### Requirement: Pure simulation детерминированно начисляет score и credits

Spaceship state SHALL содержать отдельные `score` и `credits`, а collision resolution SHALL
определять reward только из authoritative target kind/origin и способа удаления. Одинаковые seed,
state и input trace SHALL давать одинаковые balances. Projectile и shield paths SHALL использовать
одну таблицу rewards и SHALL запрещать повторную награду за уже удалённый stable entity ID.

#### Scenario: Projectile и shield обрабатывают одинаковый asteroid

- **WHEN** в одном fixed step collision candidates содержат projectile hit и shield interception
  одного asteroid
- **THEN** deterministic collision order удаляет target один раз и начисляет только один reward

#### Scenario: Два одинаковых traces

- **WHEN** simulation дважды выполняет одинаковый seeded trace через combat и intermission
- **THEN** final score, credits, winning upgrade и modifiers структурно одинаковы

### Requirement: Pure simulation разрешает один team upgrade на deadline

Core SHALL хранить общий offer, votes pilot/gunner/shield и optional purchase selection. Vote
transition SHALL только валидировать current phase/wave/offer/card/revision и заменить role vote.
При `encounterTick=600` core SHALL выбрать card по числу голосов и stable offer order, атомарно
списать price при достаточном balance, применить card role modifier и начать следующую wave.

#### Scenario: Две роли выбрали gunner

- **WHEN** pilot и shield vote указывают gunner card, а gunner vote указывает pilot card
- **THEN** deadline применяет gunner modifier один раз и очищает offer/votes для combat

#### Scenario: Replacement меняет vote role slot

- **WHEN** новая connection занимает прежний shield slot и отправляет более высокий revision
- **THEN** core заменяет shield vote, не создавая четвёртого voter identity
