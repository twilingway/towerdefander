## MODIFIED Requirements

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
