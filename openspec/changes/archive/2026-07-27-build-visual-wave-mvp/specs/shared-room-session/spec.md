## MODIFIED Requirements

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
