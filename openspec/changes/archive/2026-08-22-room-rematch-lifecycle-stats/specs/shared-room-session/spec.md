## REMOVED Requirements

### Requirement: Defeated run допускает только reconnect

**Reason**: Terminal lifecycle теперь допускает replacement и unanimous rematch в той же room.

**Migration**: v9 clients используют result/runNumber и terminal ready вместо reconnect-only
поведения v8.

## ADDED Requirements

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

Strict v9 display/controller projections SHALL публиковать `runNumber`, result outcome и public
readiness трёх roles. Lobby SHALL иметь runNumber 0 и game null; первый active run SHALL иметь
runNumber 1; каждый rematch SHALL увеличивать его ровно на один. Result SHALL иметь frozen game,
outcome и HP/result invariants: defeat имеет HP=0, victory имеет HP>0, оба result frozen. Controller
projection SHALL по-прежнему исключать mass entities, а display SHALL получать authoritative world.

#### Scenario: Первый run завершён и перезапущен

- **WHEN** display наблюдает lobby → run 1 result → run 2 combat
- **THEN** runNumber равен 0 → 1 → 2, roomId неизменен и strict projections валидны

#### Scenario: Result имеет несовместимый outcome

- **WHEN** adapter публикует victory с HP=0, defeat с HP>0 либо result без outcome
- **THEN** strict v9 schema отклоняет view

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
