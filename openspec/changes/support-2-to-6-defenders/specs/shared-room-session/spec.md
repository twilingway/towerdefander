## MODIFIED Requirements

### Requirement: Общий экран создаёт отдельную комнату

Система SHALL позволять клиенту общего экрана выбрать `playerCapacity` от 2 до 6, создать отдельную
серверную комнату и SHALL показывать идентификатор комнаты, выбранную вместимость, прямую ссылку и
QR-код для подключения контроллеров.

#### Scenario: Комната успешно создана

- **WHEN** пользователь открывает display-клиент, выбирает capacity 4 и создание комнаты
- **THEN** сервер создаёт новую комнату capacity 4, а display показывает её код, четыре места,
  ссылку и QR-код

#### Scenario: Сервер недоступен

- **WHEN** display-клиент не может установить соединение с сервером
- **THEN** он показывает понятное состояние ошибки и действие повторного подключения, не отображая
  неработающий код комнаты

### Requirement: Контроллер подключается через браузер

Система SHALL позволять контроллеру на телефоне, планшете или компьютере войти в существующую
комнату по ссылке или коду, указать непустое имя и получить серверно назначенные identity и sector.
Число player identities, включая зарезервированные reconnect места, SHALL NOT превышать
`playerCapacity`.

#### Scenario: Первый контроллер входит в комнату

- **WHEN** пользователь открывает действительную ссылку, вводит имя и подтверждает вход
- **THEN** сервер добавляет игрока в минимальный свободный сектор, controller показывает lobby, а
  display показывает имя и сектор подключившегося игрока

#### Scenario: Код комнаты не существует

- **WHEN** пользователь пытается войти с неизвестным или завершённым кодом
- **THEN** controller показывает ошибку комнаты и позволяет изменить код без перезагрузки страницы

#### Scenario: Достигнут лимит vertical slice

- **WHEN** новый controller пытается войти в комнату, где заняты или зарезервированы все
  `playerCapacity` мест
- **THEN** сервер отклоняет вход как `room_full`, не вытесняя существующих игроков

### Requirement: Сервер управляет готовностью и запуском

Система SHALL хранить ready-состояние и стабильный сектор каждого игрока на сервере и SHALL
переводить комнату из lobby в active только когда ровно `playerCapacity` controller подключены и все
они готовы. При переходе сервер SHALL создать единственное авторитетное состояние боя с
`sectorCount=playerCapacity`.

#### Scenario: Один игрок готов

- **WHEN** хотя бы одно место свободно или хотя бы один подключённый игрок не ready
- **THEN** комната остаётся в lobby, а display показывает состояние всех мест

#### Scenario: Два игрока готовы

- **WHEN** все N подключённых игроков room capacity N отмечают готовность
- **THEN** сервер переводит комнату в active, сохраняет назначенные секторы, создаёт один бой с N
  секторами и публикует начальный snapshot display и controllers

### Requirement: Краткий разрыв соединения восстанавливается

Система SHALL предоставлять контроллеру reconnection token и SHALL резервировать его identity,
ready-состояние, назначенный сектор и место в комнате в течение 30 секунд после неожиданного
разрыва. Авторитетная симуляция SHALL продолжаться во время отсутствия controller.

#### Scenario: Переподключение в пределах grace period

- **WHEN** controller теряет соединение во время lobby, active или finished и возобновляет его с
  действительным token в течение 30 секунд
- **THEN** сервер связывает соединение с прежним игроком и сектором и возвращает актуальный снимок
  без создания дубликата или второго игрового scheduler

#### Scenario: Grace period истёк

- **WHEN** controller пытается возобновить lobby-соединение после истечения 30 секунд
- **THEN** сервер отклоняет token, удаляет прежнего игрока, освобождает его сектор и предлагает
  обычный повторный вход

#### Scenario: Grace period истёк во время боя

- **WHEN** controller не восстановился за 30 секунд во время active
- **THEN** сервер освобождает его место и сектор, продолжает симуляцию и позволяет новому controller
  войти обычным способом как ready-замене именно в этот сектор

#### Scenario: Grace period истёк после боя

- **WHEN** controller не восстановился за 30 секунд во время finished
- **THEN** сервер удаляет его roster entry, оставляет owner сектора null и не изменяет финальные
  tick, result или combat values; новые игроки по-прежнему не допускаются

## ADDED Requirements

### Requirement: Protocol v4 разделяет проекции клиентов

Protocol v4 SHALL определять отдельные strict `DisplayRoomView` и `ControllerRoomView` поверх общей
части: `roomId`, `phase`, `displayConnected`, неизменяемый `playerCapacity`, список максимум из
шести игроков и компактный игровой snapshot с часами, wave/stage, intermission, динамическими
секторами, воротами, защитой, казной, зарядом авиаудара и результатом. Каждая player entry SHALL
содержать server-computed `airstrikeTargetSectorIds`, согласованные с её sector и capacity. Общая
часть snapshot SHALL включать `tick`, `elapsedMs`, `treasury`, `pathLength`, `repairCost`, `result`,
`sectors`, `waveNumber`, `totalWaves=5`, `stage`, `intermissionRemainingSeconds`, `airstrikeCharge`,
`airstrikeChargeRequired=100` и `airstrikeDamage`. Число sectors SHALL равняться `playerCapacity`.
Каждый сектор SHALL включать агрегаты `enemyCount` и `airstrikeTargetAvailable`, где последнее
означает только `enemyCount > 0`, а не полную авторизацию actor.

`DisplayRoomView` SHALL дополнительно и обязательно получать полную коллекцию `enemies` и
`lastAirstrikeEffect: null | { sequence, actionId, playerId, targetSectorId, appliedTick }` для
визуализации. Каждый display enemy SHALL включать `enemyType`, `health`, `maxHealth`, `progress` и
identity поля. `ControllerRoomView` SHALL полностью исключать поля `enemies` и
`lastAirstrikeEffect`, а не передавать пустые placeholders. Controller SHALL определять собственную
запись, назначенный сектор и target IDs по серверной identity и не SHALL напрямую изменять серверное
состояние. Colyseus StateView SHALL скрывать display-only wrapper целиком.

#### Scenario: Controller меняет локальные данные

- **WHEN** controller локально изменяет snapshot или отправляет неизвестное сообщение
- **THEN** доверенное состояние комнаты на сервере не изменяется

#### Scenario: Controller получает компактную проекцию боя

- **WHEN** во время combat в комнате существуют враги
- **THEN** controller видит capacity, roster, server-computed airstrike targets, `enemyCount` и
  `airstrikeTargetAvailable` по секторам, но его decoded state не имеет полей `enemies` и
  `lastAirstrikeEffect`

#### Scenario: Display получает полную проекцию боя

- **WHEN** во время combat в комнате существуют враги
- **THEN** display получает N секторов, типизированную коллекцию врагов и данные последнего
  авиаудара для визуализации поля

#### Scenario: Controller отправляет известную команду от имени другого игрока

- **WHEN** controller указывает в обязательном `playerId` identity другого игрока
- **THEN** server возвращает `identity_mismatch` и не изменяет доверенное состояние

#### Scenario: Клиент protocol v3 подключается к v4 серверу

- **WHEN** display или controller отправляет join или command с `protocolVersion=3`
- **THEN** сервер возвращает `protocol_mismatch` и не изменяет состояние

#### Scenario: Airstrike command соответствует v4

- **WHEN** controller отправляет `player:airstrike`
- **THEN** strict payload содержит только `protocolVersion=4`, `roomId`, `playerId`, UUID `actionId`
  и `targetSectorId` от 0 до 5

#### Scenario: Controller восстанавливается во время волны

- **WHEN** controller переподключается с действительным token во время intermission, combat или
  finished
- **THEN** он получает прежнюю identity, назначенный сектор, capacity, текущую wave/stage, заряд и
  актуальный игровой snapshot

#### Scenario: Controller восстанавливается во время боя

- **WHEN** controller переподключается с действительным token во время active или finished
- **THEN** он получает свою прежнюю identity, назначенный сектор и актуальный игровой снимок

#### Scenario: Display восстанавливается после авиаудара

- **WHEN** display переподключается после пропущенного визуального события
- **THEN** он принимает `lastAirstrikeEffect.sequence` как baseline и восстанавливает поле из
  текущего snapshot без повторного проигрывания исторического эффекта

#### Scenario: Display получает следующий авиаудар

- **WHEN** после hydration display получает snapshot с большим `lastAirstrikeEffect.sequence`
- **THEN** display ровно один раз проигрывает эффект в `targetSectorId`

#### Scenario: Controller повторяет потерянный успешный outcome

- **WHEN** авиаудар был принят, controller потерял соединение и после reconnect точно повторил тот
  же action envelope
- **THEN** сервер воспроизводит исходный accepted outcome без второго damage, charge reset, sequence
  increment или визуального эффекта

## MODIFIED Requirements

### Requirement: Симуляция не зависит от присутствия клиентов

Авторитетный scheduler SHALL продолжать активный бой при временном отсутствии display и любого числа
controllers и SHALL остановиться только после результата или уничтожения комнаты.

#### Scenario: Все клиенты находятся в grace period

- **WHEN** display и все controllers одновременно теряют соединение во время active, но комната ещё
  существует
- **THEN** сервер продолжает ровно один scheduler и возвращает восстановившимся клиентам актуальный,
  возможно уже finished, снимок

## ADDED Requirements

### Requirement: Display create и replacement имеют разные строгие options

Protocol v4 SHALL определять strict `DisplayCreateOptions` как
`{ role: "display", protocolVersion: 4, playerCapacity }` и strict `DisplayJoinOptions` как
`{ role: "display", protocolVersion: 4 }`. Create options, повторно переданные Colyseus в `onJoin`,
SHALL приниматься только если capacity совпадает с уже созданной room. Fresh display SHALL
подключаться по room ID без capacity только когда прежний display не подключён и не зарезервирован.
Ошибки до открытия room channel SHALL возвращаться как Colyseus `ServerError(4000, code)`.

#### Scenario: Некорректный create payload

- **WHEN** create payload protocol v4 не соответствует strict `DisplayCreateOptions`
- **THEN** room не становится доступной, а display получает `ServerError(4000, "invalid_message")`

#### Scenario: Старая версия имеет приоритет

- **WHEN** create или join payload содержит `protocolVersion=3`, даже если в нём отсутствует
  capacity
- **THEN** display получает `ServerError(4000, "protocol_mismatch")`

#### Scenario: Fresh display заменяет истёкший

- **WHEN** прежний display не восстановился за grace period и новый display входит по room ID с
  `DisplayJoinOptions`
- **THEN** новый display получает существующую capacity и актуальный `DisplayRoomView`

#### Scenario: Create options не совпадают с комнатой

- **WHEN** display connection передаёт create options с capacity, отличной от immutable room
  capacity
- **THEN** сервер возвращает `invalid_message` и не изменяет room

### Requirement: Public projections соблюдают cross-field invariants

Protocol adapters SHALL проверять не только отдельные поля, но и связи room view. `players.length`
SHALL быть не больше capacity; каждый player SHALL иметь уникальный sector в диапазоне capacity и
точный ordered `airstrikeTargetSectorIds`. В lobby `game` SHALL быть null, а в active/finished —
present с ordered contiguous sectors, где `sectors[i].sectorId===i`. `assignedPlayerId` SHALL
совпадать с roster owner либо быть null для свободного active/finished sector. Каждый enemy,
airstrike `targetSectorId` и target ID SHALL ссылаться на существующий сектор.
`lastAirstrikeEffect.playerId` SHALL считаться исторической identity и MAY отсутствовать в текущем
roster после expiry/replacement.

#### Scenario: Секторы переставлены

- **WHEN** wire view capacity 4 содержит четыре сектора, но их порядок не соответствует sectorId
- **THEN** strict adapter отклоняет view и UI не использует индекс как чужой сектор

#### Scenario: Active sector временно свободен

- **WHEN** grace period владельца истёк во время active до входа замены
- **THEN** game сохраняет все N contiguous sectors, а освободившийся sector имеет
  `assignedPlayerId=null`

#### Scenario: Исторический actor отсутствует

- **WHEN** player последнего авиаудара удалён после grace period
- **THEN** display view остаётся валидным при существующем effect targetSectorId, даже если
  effect.playerId больше не входит в roster

#### Scenario: Controller projection не содержит display fields

- **WHEN** controller SDK декодирует active room
- **THEN** `ControllerRoomView` проходит strict schema без добавления пустых `enemies` или
  `lastAirstrikeEffect`

### Requirement: Transport допускает типизированное переполнение

Room transport SHALL резервировать `MAX_PLAYER_CAPACITY + 2` соединений: один display, до шести
controllers и одно временное место, позволяющее room handler вернуть типизированный `room_full`.
Business admission SHALL всё равно использовать immutable `playerCapacity` и reconnect reservations.

#### Scenario: Седьмой controller

- **WHEN** седьмой controller транспортно входит в room capacity 6
- **THEN** room handler возвращает `room_full`, не оставляя его в roster

## REMOVED Requirements

### Requirement: Клиенты видят только необходимое состояние

**Reason**: Единый protocol v3 view не может строго выразить разные display/controller поля и
динамические cross-field invariants protocol v4.

**Migration**: Использовать новые strict `DisplayRoomView`, `ControllerRoomView` и requirement
«Protocol v4 разделяет проекции клиентов».
