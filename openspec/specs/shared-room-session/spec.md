# shared-room-session Specification

## Purpose

TBD - created by archiving change bootstrap-network-vertical-slice. Update Purpose after archive.

## Requirements

### Requirement: Общий экран создаёт отдельную комнату

Система SHALL позволять клиенту общего экрана создать отдельную серверную комнату и SHALL показывать
идентификатор комнаты, прямую ссылку и QR-код для подключения контроллеров.

#### Scenario: Комната успешно создана

- **WHEN** пользователь открывает display-клиент и выбирает создание комнаты
- **THEN** сервер создаёт новую комнату, а display показывает её код, ссылку и QR-код

#### Scenario: Сервер недоступен

- **WHEN** display-клиент не может установить соединение с сервером
- **THEN** он показывает понятное состояние ошибки и действие повторного подключения, не отображая
  неработающий код комнаты

### Requirement: Контроллер подключается через браузер

Система SHALL позволять контроллеру на телефоне, планшете или компьютере войти в существующую
комнату по ссылке или коду, указать непустое имя и получить серверно назначенную identity.

#### Scenario: Первый контроллер входит в комнату

- **WHEN** пользователь открывает действительную ссылку, вводит имя и подтверждает вход
- **THEN** сервер добавляет игрока, controller показывает lobby, а display показывает имя
  подключившегося игрока

#### Scenario: Код комнаты не существует

- **WHEN** пользователь пытается войти с неизвестным или завершённым кодом
- **THEN** controller показывает ошибку комнаты и позволяет изменить код без перезагрузки страницы

#### Scenario: Достигнут лимит vertical slice

- **WHEN** третий контроллер пытается войти в комнату, где уже находятся два игрока
- **THEN** сервер отклоняет вход как `room_full`, не вытесняя существующих игроков

### Requirement: Сервер управляет готовностью и запуском

Система SHALL хранить ready-состояние каждого игрока на сервере и SHALL переводить комнату из lobby
в active только после готовности двух игроков. При переходе сервер SHALL назначить игрокам разные
секторы и создать единственное авторитетное состояние боя.

#### Scenario: Один игрок готов

- **WHEN** только один из двух подключённых игроков отмечает готовность
- **THEN** комната остаётся в lobby, а display показывает состояние обоих игроков

#### Scenario: Два игрока готовы

- **WHEN** оба подключённых игрока отмечают готовность
- **THEN** сервер переводит комнату в active, назначает по одному сектору каждому игроку, создаёт
  бой и публикует его начальный снимок display и обоим controllers

### Requirement: Краткий разрыв соединения восстанавливается

Система SHALL предоставлять контроллеру reconnection token и SHALL резервировать его identity,
ready-состояние, назначенный сектор и место в комнате в течение 30 секунд после неожиданного
разрыва. Авторитетная симуляция SHALL продолжаться во время отсутствия controller.

#### Scenario: Переподключение в пределах grace period

- **WHEN** controller теряет соединение во время lobby, active или finished и возобновляет его с
  действительным token в течение 30 секунд
- **THEN** сервер связывает соединение с прежним игроком и возвращает актуальный снимок без создания
  дубликата или второго игрового scheduler

#### Scenario: Grace period истёк

- **WHEN** controller пытается возобновить lobby-соединение после истечения 30 секунд
- **THEN** сервер отклоняет token, удаляет прежнего игрока и предлагает обычный повторный вход

#### Scenario: Grace period истёк во время боя

- **WHEN** controller не восстановился за 30 секунд во время active
- **THEN** сервер освобождает его место и сектор, продолжает симуляцию и позволяет новому controller
  войти обычным способом как замене в этот сектор

### Requirement: Краткий разрыв общего экрана не уничтожает комнату

Система SHALL сохранять identity общего экрана в течение 30 секунд после неожиданного разрыва и
SHALL отражать его присутствие в серверном состоянии.

#### Scenario: Display восстанавливается в пределах grace period

- **WHEN** общий экран неожиданно теряет соединение и восстанавливает его с действительным token в
  течение 30 секунд
- **THEN** он возвращается в прежнюю комнату, существующие игроки сохраняются, а `displayConnected`
  снова становится `true`

#### Scenario: Display покидает комнату намеренно

- **WHEN** общий экран закрывает соединение с consented leave
- **THEN** сервер снимает его presence без резервирования identity для reconnect

### Requirement: Клиенты видят только необходимое состояние

Display и controllers SHALL получать общую публичную часть состояния комнаты: `roomId`, `phase`,
`displayConnected`, список максимум из двух игроков и компактный игровой snapshot с часами,
wave/stage, intermission, секторами, воротами, защитой, казной, зарядом авиаудара и результатом.
Protocol v3 SHALL использовать strict runtime schemas и SHALL отклонять неизвестные поля. Общая
часть snapshot SHALL включать существующие `tick`, `elapsedMs`, `treasury`, `pathLength`,
`repairCost`, `result`, `sectors` и новые `waveNumber`, `totalWaves=5`, `stage`,
`intermissionRemainingSeconds`, `airstrikeCharge`, `airstrikeChargeRequired=100`, `airstrikeDamage`.
Каждый сектор SHALL включать агрегаты `enemyCount` и `airstrikeTargetAvailable`.

Display SHALL дополнительно получать полную коллекцию `enemies` и
`lastAirstrikeEffect: null | { sequence, actionId, playerId, targetSectorId, appliedTick }` для
визуализации. Каждый display enemy SHALL включать `enemyType`, `health`, `maxHealth`, `progress` и
identity поля. Controller SHALL получать только компактную проекцию: коллекция `enemies` и
индивидуальные identity, type, health, maxHealth, progress врагов SHALL быть ему недоступны.
Controller SHALL определять собственную запись и назначенный сектор по серверной identity и не SHALL
напрямую изменять серверное состояние.

#### Scenario: Controller меняет локальные данные

- **WHEN** controller локально изменяет snapshot или отправляет неизвестное сообщение
- **THEN** доверенное состояние комнаты на сервере не изменяется

#### Scenario: Controller получает компактную проекцию боя

- **WHEN** во время combat в комнате существуют враги
- **THEN** controller видит `enemyCount` и `airstrikeTargetAvailable` по секторам, но не получает
  коллекцию врагов, их identity, типы, здоровье или прогресс

#### Scenario: Display получает полную проекцию боя

- **WHEN** во время combat в комнате существуют враги
- **THEN** display получает типизированную коллекцию врагов и данные последнего авиаудара для
  визуализации поля

#### Scenario: Controller отправляет известную команду от имени другого игрока

- **WHEN** controller указывает в обязательном `playerId` identity другого игрока
- **THEN** server возвращает `identity_mismatch` и не изменяет доверенное состояние

#### Scenario: Клиент protocol v2 подключается к v3 серверу

- **WHEN** display или controller отправляет join или command с `protocolVersion=2`
- **THEN** сервер возвращает `protocol_mismatch` и не изменяет состояние

#### Scenario: Airstrike command соответствует v3

- **WHEN** controller отправляет `player:airstrike`
- **THEN** strict payload содержит только `protocolVersion=3`, `roomId`, `playerId`, UUID `actionId`
  и `targetSectorId`

#### Scenario: Controller восстанавливается во время волны

- **WHEN** controller переподключается с действительным token во время intermission, combat или
  finished
- **THEN** он получает прежнюю identity, назначенный сектор, текущую wave/stage, заряд и актуальный
  игровой snapshot

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

- **WHEN** авиаудар был принят, controller потерял соединение и после reconnect повторил тот же
  `actionId`
- **THEN** сервер воспроизводит исходный accepted outcome без второго damage, charge reset, sequence
  increment или визуального эффекта

### Requirement: Симуляция не зависит от присутствия клиентов

Авторитетный scheduler SHALL продолжать активный бой при временном отсутствии display, одного или
обоих controllers и SHALL остановиться только после результата или уничтожения комнаты.

#### Scenario: Все клиенты находятся в grace period

- **WHEN** display и controllers одновременно теряют соединение во время active, но комната ещё
  существует
- **THEN** сервер продолжает ровно один scheduler и возвращает восстановившимся клиентам актуальный,
  возможно уже finished, снимок

### Requirement: Сервер завершает комнату по результату боя

Сервер SHALL продвигать бой только дискретными фиксированными шагами и SHALL перевести комнату из
active в finished, когда авторитетное ядро возвращает `victory` или `defeat`.

#### Scenario: Ядро возвращает результат

- **WHEN** после очередного шага результат боя становится `victory` или `defeat`
- **THEN** сервер переводит комнату в finished и публикует финальный неизменяемый снимок всем
  подключённым клиентам
