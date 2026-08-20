## ADDED Requirements

### Requirement: Display задаёт вместимость комнаты

Display SHALL до создания комнаты выбрать целое `playerCapacity` от 2 до 6 включительно, по
умолчанию 2. Сервер SHALL сохранить capacity как публичную неизменяемую настройку комнаты.
Controller SHALL NOT задавать или изменять capacity.

#### Scenario: Комната на четыре игрока создана

- **WHEN** display создаёт комнату с `playerCapacity=4`
- **THEN** сервер публикует capacity 4, а display и controllers показывают четыре места

#### Scenario: Вместимость не указана

- **WHEN** пользователь не меняет настройку перед созданием
- **THEN** display отправляет `playerCapacity=2`

#### Scenario: Вместимость вне диапазона

- **WHEN** create payload содержит capacity меньше 2, больше 6, дробь или неизвестное поле
- **THEN** сервер возвращает `invalid_message` и не создаёт доступную комнату

### Requirement: Room выделяет стабильные места

Room SHALL иметь места и сектора `0..playerCapacity-1`, назначать новому игроку минимальный
свободный sector и SHALL NOT перенумеровывать существующих игроков. Зарезервированное reconnect
место SHALL считаться занятым до восстановления или истечения 30 секунд.

#### Scenario: Игроки входят не одновременно

- **WHEN** три controller последовательно входят в room capacity 4
- **THEN** они получают стабильные секторы 0, 1 и 2 уже в lobby

#### Scenario: Reconnect сохраняет дорогу

- **WHEN** игрок сектора 2 восстанавливается с действительным token в пределах grace period
- **THEN** он снова получает сектор 2, а остальные игроки не перенумеровываются

#### Scenario: Замена во время боя

- **WHEN** grace period игрока сектора 1 истёк в active и новый controller входит в комнату
- **THEN** новый игрок получает сектор 1, считается ready и принимает актуальный snapshot

#### Scenario: Finished room закрыта для замены

- **WHEN** новый controller пытается войти в finished room
- **THEN** сервер отклоняет вход и не изменяет roster

### Requirement: Матч стартует только полным составом

Room SHALL автоматически перейти из lobby в active ровно один раз только когда число подключённых
игроков равно `playerCapacity` и каждый из них ready. Display presence не SHALL заменять место
игрока.

#### Scenario: Не все места заняты

- **WHEN** в room capacity 6 подключены и готовы пять игроков
- **THEN** комната остаётся в lobby

#### Scenario: Один игрок не готов

- **WHEN** в room capacity 3 подключены три игрока, но ready только двое
- **THEN** комната остаётся в lobby

#### Scenario: Полный состав готов

- **WHEN** в room capacity N все N controller подключены и ready
- **THEN** сервер создаёт один бой с `sectorCount=N` и переводит комнату в active

### Requirement: Сервер публикует допустимые цели игрока

Каждая публичная player entry SHALL иметь обязательный non-null sector s и SHALL содержать
`airstrikeTargetSectorIds`: уникальные существующие sector IDs в порядке self, left, right для
кольца capacity N. Все значения SHALL быть целыми от 0 до 5 и меньше `playerCapacity`. Server SHALL
назначить sector и targets до вставки player entry в публичный roster.

#### Scenario: Два сектора

- **WHEN** server публикует entry игрока sector 0 в room capacity 2
- **THEN** `airstrikeTargetSectorIds` равен `[0, 1]` без повторов

#### Scenario: Первый игрок сразу имеет сектор

- **WHEN** первый controller входит в lobby room capacity 6
- **THEN** первая опубликованная entry уже содержит `sectorId=0` и targets `[0, 5, 1]`

#### Scenario: Шесть секторов

- **WHEN** server публикует entry игрока sector 0 в room capacity 6
- **THEN** `airstrikeTargetSectorIds` равен `[0, 5, 1]`

#### Scenario: Разные игроки получают разные цели

- **WHEN** controllers секторов 0 и 2 получают room capacity 6
- **THEN** их player entries содержат соответственно `[0, 5, 1]` и `[2, 1, 3]`

#### Scenario: Controller выбирает цели

- **WHEN** controller получает свою строгую room projection
- **THEN** он показывает только `airstrikeTargetSectorIds` собственной server identity и не
  вычисляет topology самостоятельно
