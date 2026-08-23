## MODIFIED Requirements

### Requirement: Continuous intents упорядочены

Каждый continuous intent SHALL содержать current protocolVersion, roomId, playerId и монотонный safe
integer `sequence`. Server SHALL применять только sequence больше последнего принятого для
actor/input type. Duplicate или out-of-order sequence SHALL игнорироваться без mutation и SHALL NOT
менять angular target. Shield `active` SHALL быть absolute desired state: handler только заменяет
latest state, а energy расходуется один раз на authoritative simulation tick, поэтому duplicate
packet SHALL NOT умножать расход. При disconnect server SHALL немедленно задать безопасный intent:
pilot target zero, gunner firing false, shield OFF, а также отменить gunner/shield angular target
через trusted core transition. После reconnect sequence watermark SHALL сбрасываться, первый packet
sequence 1 SHALL приниматься, shield SHALL оставаться OFF до нового ручного включения, а отменённый
angular target SHALL NOT восстанавливаться. При переходе combat→intermission server SHALL выполнить
ту же trusted neutralization и SHALL NOT переносить held input в следующую wave.

#### Scenario: Пакеты пришли не по порядку

- **WHEN** server после sequence 12 получает sequence 11 с другим bearing
- **THEN** последний применённый control, angular target и sequence остаются от packet 12

#### Scenario: Повторён shield ON

- **WHEN** shield input с `active=true` и aim доставлен дважды с одинаковым sequence
- **THEN** duplicate игнорируется, не меняет target, а energy уменьшается только обычным fixed-step
  drain

#### Scenario: Identity подменена

- **WHEN** controller указывает playerId другого connection
- **THEN** server возвращает `identity_mismatch`, не записывает sequence и не меняет target

#### Scenario: Pilot отключился с зажатым направлением

- **WHEN** pilot connection закрывается во время движения
- **THEN** server немедленно обнуляет target vector, а core плавно тормозит spaceship внутри circle

#### Scenario: Pilot восстановил соединение

- **WHEN** pilot reconnect отправляет sequence 1
- **THEN** server принимает packet для прежней role после сброса connection watermark

#### Scenario: Shield отключился

- **WHEN** shield controller disconnect происходит при active shield и незавершённом traverse
- **THEN** server немедленно выключает shield, energy начинает восстанавливаться, отменяет angular
  target, а reconnect не возвращает прежний ON state и не продолжает traverse

#### Scenario: Wave завершилась с удерживаемым управлением

- **WHEN** combat переходит в intermission при movement/fire/shield intents
- **THEN** server neutralizes intents/targets, выключает shield и новая wave не возобновляет старое
  управление без свежих packets

### Requirement: Controller управляет готовностью к следующему run

В lobby кнопка ready SHALL готовить первый run с runNumber 0; в terminal result та же current strict
ready command SHALL означать «Играть ещё» для текущего runNumber. Кнопка SHALL показывать
authoritative ready state, блокироваться после принятия и снова становиться false при следующем
terminal result. Combat/intermission SHALL не показывать rematch action.

#### Scenario: Игрок голосует после поражения

- **WHEN** gunner нажимает «Играть ещё» в result run 3
- **THEN** controller отправляет ready с runNumber 3 и показывает принятое authoritative ready

#### Scenario: Ready старого run задержался

- **WHEN** controller доставляет ready run 3 после старта run 4
- **THEN** UI получает `stale_run`, а готовность run 4 не меняется
