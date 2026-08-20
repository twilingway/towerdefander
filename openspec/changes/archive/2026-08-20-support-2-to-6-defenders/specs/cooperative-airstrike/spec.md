## RENAMED Requirements

- FROM: `### Requirement: Игрок направляет авиаудар в любой сектор`
- TO: `### Requirement: Игрок направляет авиаудар в свой или соседний сектор`

## MODIFIED Requirements

### Requirement: Игрок направляет авиаудар в свой или соседний сектор

Controller SHALL отправлять `player:airstrike` с `protocolVersion`, `roomId`, `playerId`, `actionId`
и `targetSectorId`. Для room capacity N допустимыми целями игрока сектора s SHALL быть уникальное
множество `{s, (s-1+N)%N, (s+1)%N}`. Сервер SHALL сверять identity, существование target, topology,
active combat stage и полный заряд 100. Room SHALL вывести trusted `sourceSectorId` из player
assignment и передать его с target и sectorCount в pure game-core ring validation. После успешной
проверки ядро SHALL атомарно списывать 100 заряда, наносить настроенный урон всем активным врагам
выбранного сектора, начислять reward и новый charge за уничтоженных врагов от нулевой базы с
пределом 100. Пустой target sector SHALL отклоняться как `action_not_available` без расхода заряда.

#### Scenario: Помощь соседнему сектору

- **WHEN** игрок с полным зарядом выбирает левый или правый соседний сектор в кольце
- **THEN** сервер применяет урон ко всем врагам выбранного сектора

#### Scenario: Цель не является соседом

- **WHEN** игрок room capacity 6 направляет авиаудар в существующий, но не свой и не соседний сектор
- **THEN** сервер записывает и возвращает business outcome `action_not_available` без расхода заряда
  и урона

#### Scenario: Два сектора дедуплицируют соседей

- **WHEN** игрок room capacity 2 открывает выбор target
- **THEN** controller показывает ровно два уникальных target: свой и другой сектор

#### Scenario: Заряд неполный

- **WHEN** controller отправляет авиаудар при `airstrikeCharge` меньше 100
- **THEN** сервер возвращает `action_not_available` и не изменяет заряд или врагов

#### Scenario: Intermission

- **WHEN** controller отправляет авиаудар во время intermission
- **THEN** сервер возвращает `action_not_available` и сохраняет заряд для следующей combat stage

#### Scenario: Авиаудар уничтожает несколько врагов

- **WHEN** принятый авиаудар с зарядом 100 уничтожает несколько врагов выбранного сектора
- **THEN** ядро сначала расходует 100, а затем начисляет их настроенные reward и charge от нулевой
  базы с пределом 100

#### Scenario: В целевом секторе нет врагов

- **WHEN** controller отправляет допустимый авиаудар в сектор без активных врагов
- **THEN** сервер возвращает `action_not_available` и не изменяет charge или last effect

#### Scenario: Авиаудар отправлен вне активного матча

- **WHEN** controller отправляет авиаудар в lobby или finished
- **THEN** сервер возвращает `invalid_phase` без изменения игрового состояния

#### Scenario: Целевой сектор некорректен

- **WHEN** payload не соответствует strict v4 schema или targetSectorId находится вне 0..5
- **THEN** сервер возвращает `invalid_message` без записи business outcome

#### Scenario: Целевой сектор отсутствует в комнате

- **WHEN** strict payload содержит глобально допустимый targetSectorId, который не меньше
  `playerCapacity`
- **THEN** сервер записывает и возвращает business outcome `action_not_available` без расхода заряда
