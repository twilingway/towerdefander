## ADDED Requirements

### Requirement: Начальная общая казна масштабируется по числу секторов

Авторитетное ядро SHALL выводить стартовую treasury по формуле `25 * sectorCount` для sectorCount от
2 до 6, а не принимать произвольную startingTreasury в `DefenseConfig`. Стоимость ремонта, улучшения
и reward одного врага SHALL оставаться независимыми от числа секторов.

#### Scenario: Создан бой на шесть игроков

- **WHEN** ядро создаёт prototype бой с `sectorCount=6`
- **THEN** начальная treasury равна 150

#### Scenario: Награда не масштабируется повторно

- **WHEN** один enemy одинакового type уничтожен в бою на 2 и в бою на 6 секторов
- **THEN** treasury обоих боёв увеличивается на одинаковый настроенный reward

### Requirement: Владелец действует только в назначенном динамическом секторе

Repair и upgrade SHALL определять target sector только из серверного назначения игрока и SHALL
проверять, что sector существует в диапазоне `0..playerCapacity-1`.

#### Scenario: Игрок шестого сектора ремонтирует ворота

- **WHEN** владелец sector 5 в room capacity 6 отправляет допустимый repair
- **THEN** сервер применяет действие только к воротам sector 5

#### Scenario: Назначение вне capacity

- **WHEN** внутреннее назначение игрока не соответствует текущему playerCapacity
- **THEN** сервер отклоняет действие без изменения game state

## MODIFIED Requirements

### Requirement: Игровые действия идемпотентны в пределах комнаты

Сервер SHALL обрабатывать действие в порядке: strict parse/version, controller role, room/player
identity, journal lookup/fingerprint comparison, business validation/mutation и запись outcome.
Fingerprint SHALL быть `{commandType}` для repair/upgrade и `{commandType,targetSectorId}` для
airstrike; actor SHALL храниться отдельно. Envelope, protocol, identity и collision errors SHALL NOT
записываться. Accepted outcome и business rejection `invalid_phase`, `insufficient_funds` или
`action_not_available` SHALL сохраняться до disposal комнаты и SHALL никогда не вычисляться заново
для точного повтора.

Accepted outcome SHALL наблюдаться как отсутствие `server:error` и последующий snapshot; rejected
outcome SHALL наблюдаться как actor-only `server:error`. Точный повтор SHALL воспроизводить такое же
наблюдаемое поведение.

#### Scenario: Повтор успешного действия

- **WHEN** сервер повторно получает то же действие того же игрока с ранее успешно применённым
  `actionId`
- **THEN** сервер снова не отправляет error, а состояние, казна и уровень защиты не изменяются
  повторно

#### Scenario: Игрок подменяет identity

- **WHEN** контроллер отправляет действие с `roomId` другой комнаты или чужим `playerId`
- **THEN** сервер возвращает `identity_mismatch`, не записывает actionId и не изменяет игровое
  состояние

#### Scenario: Действие вне активного боя

- **WHEN** контроллер отправляет `repair` или `upgrade` в lobby или после завершения боя
- **THEN** сервер записывает outcome и возвращает `server:error` с `invalid_phase`, не изменяя
  игровое состояние

#### Scenario: Повтор ранее отклонённого действия

- **WHEN** ранее допустимый по envelope и identity `actionId` получил `insufficient_funds`,
  `action_not_available` или `invalid_phase`, а затем точно повторён после изменения состояния
- **THEN** сервер повторяет исходный `server:error` без повторной business проверки и без изменения
  состояния

#### Scenario: ActionId повторён с другим намерением

- **WHEN** существующий `actionId` отправлен другим actor, command type или нормализованным payload
- **THEN** сервер возвращает `server:error` с `invalid_message`, не раскрывает и не перезаписывает
  сохранённый outcome и не изменяет состояние

#### Scenario: Accepted действие повторено после завершения

- **WHEN** точный повтор принятого actionId приходит после перехода room в finished
- **THEN** сервер не отправляет error, проверяет journal до текущей phase и не изменяет финальный
  snapshot
