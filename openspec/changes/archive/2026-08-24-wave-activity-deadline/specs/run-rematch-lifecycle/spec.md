## MODIFIED Requirements

### Requirement: Заброшенные комнаты имеют ограниченный lifetime

Server SHALL иметь конфигурируемые deadlines с defaults: display reconnect grace 30 секунд,
never-started lobby 15 минут, terminal result 10 минут, 5 минут после исчезновения всех connected и
reserved controller identities и absolute room lifetime 12 часов. Самый ранний применимый closing
deadline SHALL закрывать room. Fresh lobby SHALL использовать 15 минут до первого controller join;
после того как хотя бы один controller был и все identities освобождены, SHALL действовать 5 минут.
Gameplay/latency traffic, wave transition и rematch SHALL NOT продлевать fixed lobby/result/absolute
deadlines. Disposal SHALL один раз остановить simulation, latency probes, wave timer и TTL timers и
очистить journals/metadata.

#### Scenario: Display не восстановился

- **WHEN** display transport потерян и reconnect не произошёл за 30 секунд
- **THEN** room закрывается независимо от более поздних deadlines

#### Scenario: Новая lobby осталась пустой

- **WHEN** display создал room, controllers ни разу не входили и прошло 15 минут
- **THEN** room закрывается и исчезает из matchmaking/statistics

#### Scenario: Все controller identities исчезли

- **WHEN** последняя reconnect reservation истекла и в room нет controller identities 5 минут
- **THEN** room закрывается даже при подключённом display

#### Scenario: Result никто не перезапустил

- **WHEN** terminal result существует 10 минут без успешного unanimous rematch
- **THEN** room закрывается, а повторный ready после disposal невозможен

#### Scenario: Достигнут абсолютный lifetime

- **WHEN** room существует 12 часов независимо от текущей phase, wave и rematch activity
- **THEN** server закрывает room с `room_lifetime_expired` и освобождает все timers/state

#### Scenario: Rematch не продлевает hard cap

- **WHEN** команда запускает новый run в той же комнате до absolute deadline
- **THEN** wave 1 получает новый wave deadline, но исходный 12-часовой timestamp комнаты не меняется
