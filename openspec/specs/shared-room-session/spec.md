# shared-room-session Specification

## Purpose

TBD - created by archiving change bootstrap-network-vertical-slice. Update Purpose after archive.

## Requirements

### Requirement: Сервер запускает матч после готовности трёх ролей

Server SHALL запускать simulation только когда pilot, gunner и shield подключены и каждый ready.
Strict `controller:ready` SHALL содержать protocolVersion, roomId и playerId; server SHALL сверять
actor и принимать его только в lobby. Ready повторяем и идемпотентен. После старта свежий controller
может занять только истёкшую свободную role и становится ready автоматически.

#### Scenario: Не все роли готовы

- **WHEN** подключены три игрока, но ready только два
- **THEN** phase остаётся `lobby`

#### Scenario: Все роли готовы

- **WHEN** третья занятая role становится ready
- **THEN** phase становится `active`, создаётся spaceship state и запускается fixed-step timer

#### Scenario: Ready повторён в lobby

- **WHEN** тот же controller повторяет valid `controller:ready`
- **THEN** ready остаётся true без второго transition

#### Scenario: Ready отправлен после старта

- **WHEN** controller отправляет `controller:ready` в active phase
- **THEN** server возвращает `invalid_phase` и world не изменяется

### Requirement: Краткий разрыв сохраняет identity и role

Server SHALL разрешать controller и display reconnect в течение 30 секунд. Во время controller grace
player остаётся в roster с `connected=false`; после expiry запись удаляется, role освобождается, а
active simulation продолжает работать с безопасным stale-input behavior. Если display не
восстановился до expiry, server SHALL остановить simulation, закрыть оставшиеся connections и
dispose room, поскольку в первом slice нет terminal result и никто не может наблюдать session.
Consented controller leave SHALL немедленно освободить role, потому что клиент явно отказался от
reconnect; 30-second reservation применяется только к неожиданному разрыву.

#### Scenario: Controller осознанно покинул комнату

- **WHEN** active controller выполняет consented leave
- **THEN** server немедленно освобождает role для replacement

#### Scenario: Pilot вернулся в grace period

- **WHEN** pilot reconnect завершается до 30 секунд
- **THEN** playerId, role, ready и текущий world сохраняются

#### Scenario: Gunner не вернулся

- **WHEN** grace period gunner истёк
- **THEN** gunner role освобождается для replacement, а мир не пересоздаётся

#### Scenario: Display не вернулся

- **WHEN** 30-second grace period display истёк
- **THEN** server останавливает simulation и dispose room, а controllers возвращаются на join screen

### Requirement: Симуляция живёт независимо от controller transport

После старта server SHALL выполнять fixed step пока room существует, даже если один или все
controllers временно отключены. Combat/intermission SHALL продолжать authoritative encounter time, а
stale/disconnected controls SHALL нейтрализоваться. При `result` с terminal outcome fixed-step timer
MAY продолжать room clock/latency lifecycle, но combat state SHALL оставаться frozen и новые
spawns/damage SHALL быть запрещены.

#### Scenario: Все controllers временно отключены

- **WHEN** active combat room теряет три controller connections
- **THEN** simulation tick и encounter продолжаются, а stale inputs переводят системы в безопасное
  состояние

#### Scenario: Controllers отключены в intermission

- **WHEN** intermission deadline наступает без подключённых controllers
- **THEN** deterministic fallbacks применяются к трём ролям и следующая wave начинается

#### Scenario: Run завершён поражением

- **WHEN** encounter имеет phase `result` и outcome=`defeat`
- **THEN** reconnect видит сохранённый final result, а combat entities/HP больше не мутируют

### Requirement: Terminal run допускает reconnect, replacement и rematch

После terminal result server SHALL сохранять identities в существующий 30-second reconnect grace и
разрешать reconnect к frozen snapshot. Fresh controller SHALL занимать только фактически свободную
role после consented leave либо reservation expiry. Existing и replacement controllers SHALL
участвовать в unanimous rematch; display reconnect SHALL сохранять result/rematch readiness, а
display expiry SHALL закрывать room. Controller join SHALL быть запрещён после начала disposal.

#### Scenario: Зарезервированный pilot возвращается после result

- **WHEN** прежний pilot reconnect выполняется до expiry
- **THEN** identity/role/readiness восстанавливаются и controller получает current result/runNumber

#### Scenario: Новый controller входит после освобождения role

- **WHEN** прежняя shield identity явно вышла либо её reservation истекла
- **THEN** fresh controller получает shield role, видит result и может подтвердить rematch

#### Scenario: Новый controller входит до expiry

- **WHEN** fresh controller пытается занять зарезервированную role
- **THEN** server возвращает `room_full` и не меняет reservation/readiness

### Requirement: Room projection публикует run epoch и terminal result

Strict current-protocol display/controller projections SHALL публиковать `runNumber`, result
outcome, public readiness трёх roles и circular geometry `worldWidth/worldHeight/arenaRadius`. Lobby
SHALL иметь runNumber 0 и game null; первый active run SHALL иметь runNumber 1; каждый rematch SHALL
увеличивать его ровно на один. Result SHALL иметь frozen game, outcome и HP/result invariants:
defeat имеет HP=0, victory имеет HP>0, оба result frozen. Controller projection SHALL по-прежнему
исключать mass entities, а display SHALL получать authoritative world. Reconnect SHALL получать
current geometry и positions без client correction.

#### Scenario: Первый run завершён и перезапущен

- **WHEN** display наблюдает lobby → run 1 result → run 2 combat
- **THEN** runNumber равен 0 → 1 → 2, roomId неизменен, arenaRadius остаётся authoritative и strict
  projections валидны

#### Scenario: Result имеет несовместимый outcome

- **WHEN** adapter публикует victory с HP=0, defeat с HP>0 либо result без outcome
- **THEN** current strict schema отклоняет view

#### Scenario: Spaceship опубликован за кругом

- **WHEN** adapter публикует spaceship center/radius вне arenaRadius
- **THEN** current strict controller/display schemas отклоняют view

### Requirement: Сервер валидирует runNumber до per-run mutation

После protocol/schema/connection/room/player checks server SHALL сверять command runNumber с room
runNumber до role phase, continuous sequence, resource action journal, ready mutation либо core.
Mismatch SHALL вернуть actor-only `stale_run`. Valid current-run commands SHALL продолжать
существующий role/phase/idempotency pipeline.

#### Scenario: Старый packet имеет новый sequence

- **WHEN** authenticated controller отправляет input предыдущего run с sequence выше current
  watermark
- **THEN** server возвращает `stale_run`, а watermark и world остаются прежними

#### Scenario: Display пытается голосовать за rematch

- **WHEN** display отправляет ready current run
- **THEN** server возвращает `not_controller` и readiness не меняется
