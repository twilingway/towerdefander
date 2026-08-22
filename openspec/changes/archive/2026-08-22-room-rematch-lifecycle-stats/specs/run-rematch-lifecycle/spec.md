## ADDED Requirements

### Requirement: Terminal result сохраняет комнату для повторного забега

При завершении run server SHALL остановить боевую симуляцию, нейтрализовать continuous intents,
сохранить frozen final snapshot и опубликовать result outcome `defeat|victory`. `defeat` SHALL иметь
HP=0, `victory` SHALL иметь HP>0, и оба результата SHALL оставаться frozen. Текущий endless combat
SHALL создавать только `defeat`; источник `victory` не вводится этим change. Server SHALL сбросить
readiness всех трёх roles и SHALL NOT начинать новый run без нового unanimous readiness.

#### Scenario: Замок уничтожен

- **WHEN** authoritative HP достигает нуля в run 1
- **THEN** result равен `defeat`, final wave/score/entities заморожены и readiness всех players
  false

#### Scenario: Result поддерживает будущую победу

- **WHEN** будущий authoritative campaign передаёт terminal outcome `victory`
- **THEN** room использует тот же frozen result/rematch lifecycle без локального решения display

### Requirement: Три роли запускают чистый rematch в той же комнате

В result каждый occupied connected controller SHALL иметь действие «Играть ещё». Server SHALL
запустить ровно один новый run, только когда `pilot`, `gunner` и `shield` заняты, подключены и имеют
ready=true. RoomId, connections, player identities и assigned roles SHALL сохраниться; runNumber
SHALL увеличиться на один, а seed, HP, score, wave, entities, upgrade offers/selections/modifiers,
input state и per-run journals SHALL быть созданы заново без переноса progress.

#### Scenario: Все три игрока готовы

- **WHEN** в result run 1 три подключённые role последовательно отправили ready для runNumber 1
- **THEN** server один раз создаёт run 2 с новым seed и чистым state в том же roomId

#### Scenario: Готовы только два игрока

- **WHEN** pilot и gunner готовы, но shield не готов либо отключён
- **THEN** final result остаётся frozen и runNumber не меняется

#### Scenario: Ready доставлен повторно

- **WHEN** уже готовый controller повторяет ready для текущего result
- **THEN** readiness остаётся true и повторный run не создаётся

#### Scenario: Replacement завершает сбор экипажа

- **WHEN** прежняя role освободилась после consented leave или reconnect expiry, replacement вошёл и
  все три текущие role подтвердили ready
- **THEN** replacement сохраняет назначенную role и участвует в единственном новом run

### Requirement: Run epoch изолирует последовательные забеги

Protocol v9 SHALL публиковать positive safe integer `runNumber` в active/result snapshots и SHALL
требовать expected runNumber во всех ready, gameplay, upgrade и rematch commands. Lobby до первого
run SHALL иметь runNumber 0. Server SHALL проверять runNumber после strict schema/connection
identity и до phase, sequence, action journal либо simulation mutation. Packet другого run SHALL
получить actor-only `stale_run` и SHALL NOT менять watermark, journal, readiness или world.

#### Scenario: Запоздавшее движение первого забега

- **WHEN** после старта run 2 pilot отправляет valid-shape input с runNumber 1 и большим sequence
- **THEN** server возвращает `stale_run`, не записывает sequence и не двигает castle

#### Scenario: Старый upgrade action повторён после rematch

- **WHEN** после старта run 2 controller повторяет accepted upgrade command run 1
- **THEN** server возвращает `stale_run`, не применяет modifier и не изменяет journal run 2

#### Scenario: Клиент v8 подключается к v9

- **WHEN** create/join либо message использует protocolVersion 8
- **THEN** server отклоняет его стабильной ошибкой `protocol_mismatch` без mutation

### Requirement: Явный выход отличается от recoverable disconnect

Controller SHALL показывать подтверждаемое действие «Выйти из комнаты», прекращать scheduler,
очищать reconnect token и выполнять consented leave; server SHALL немедленно освобождать только его
identity/role. Display SHALL показывать подтверждаемое действие «Закрыть комнату»; consented leave
display SHALL закрыть room и отключить остальных клиентов. Reload, transport drop и background loss
SHALL NOT считаться явным выходом и SHALL сохранять существующий 30-second reconnect grace.

#### Scenario: Controller выходит явно

- **WHEN** gunner подтверждает «Выйти из комнаты»
- **THEN** gunner scheduler остановлен, token удалён, role сразу свободна, а display и другие roles
  остаются в room

#### Scenario: Controller перезагружает страницу

- **WHEN** browser transport закрывается без consented leave и возвращается за 30 секунд
- **THEN** прежние identity/role восстанавливаются и exit UI не выполняется

#### Scenario: Display закрывает комнату

- **WHEN** display подтверждает «Закрыть комнату»
- **THEN** server disposes room, controllers получают стабильное закрытие и возвращаются к join UI

### Requirement: Заброшенные комнаты имеют ограниченный lifetime

Server SHALL иметь конфигурируемые deadlines с defaults: display reconnect grace 30 секунд, never-
started lobby 15 минут, terminal result 10 минут, 5 минут после исчезновения всех connected и
reserved controller identities и absolute room lifetime 4 часа. Самый ранний применимый deadline
SHALL закрывать room. Fresh lobby SHALL использовать 15 минут до первого controller join; после того
как хотя бы один controller был и все identities освобождены, SHALL действовать 5 минут.
Gameplay/latency traffic SHALL NOT продлевать fixed lobby/result/absolute deadlines. Disposal SHALL
один раз остановить simulation, latency probes, TTL timers и очистить journals/metadata.

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

- **WHEN** room существует 4 часа независимо от текущей phase и activity
- **THEN** server закрывает room и освобождает все timers/state
