## MODIFIED Requirements

### Requirement: Role ограничивает допустимые intents

Pilot SHALL отправлять только `pilot:input` и собственный `upgrade:choose`, gunner — `gunner:input`
и собственный `upgrade:choose`, shield — `shield:input` и собственный `upgrade:choose`. Server SHALL
сверять connection identity/role до mutation; ни одна role SHALL NOT выбирать offer другой role.

#### Scenario: Shield пытается двигать замок

- **WHEN** shield controller отправляет strict pilot input
- **THEN** server возвращает `role_mismatch` и castle state не меняется

#### Scenario: Gunner выбирает shield upgrade

- **WHEN** gunner controller отправляет strict command для current shield offer
- **THEN** server возвращает `role_mismatch` и selection/modifiers не меняются

#### Scenario: Display отправляет role intent

- **WHEN** display отправляет известный gameplay или upgrade message
- **THEN** server возвращает `not_controller` и не меняет мир

### Requirement: Continuous intents упорядочены

Каждый continuous intent SHALL содержать protocolVersion 8, roomId, playerId и монотонный safe
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
- **THEN** server немедленно обнуляет target vector, а core плавно тормозит castle

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

## ADDED Requirements

### Requirement: Controller показывает собственный upgrade choice

Во время intermission controller SHALL скрыть/disable realtime role controls, показать authoritative
countdown, три cards только assigned role и current selection. Card SHALL показывать понятные effect
label/value и отправлять один strict `upgrade:choose` с новым UUID actionId. UI SHALL принимать
authoritative selection/modifiers как source of truth, безопасно повторять pending command после
reconnect и запрещать второй локальный выбор после accepted result. В combat controls SHALL
возобновиться с neutral local state; в defeated SHALL показываться final wave/score без input.

#### Scenario: Pilot выбирает скорость

- **WHEN** pilot нажимает доступную speed card во время intermission
- **THEN** controller отправляет свой current offer/upgrade/actionId, затем показывает accepted
  authoritative selection и applied modifier

#### Scenario: Controller reconnect во время выбора

- **WHEN** gunner reconnect происходит до результата pending command
- **THEN** controller hydrate current offer/selection; если selection отсутствует, он MAY повторить
  тот же exact command/actionId, а accepted modifier появляется не более одного раза

#### Scenario: Replacement входит после выбора

- **WHEN** новая identity занимает role, уже выбравшую upgrade
- **THEN** cards показывают authoritative selected state/modifiers и не позволяют выбрать повторно

#### Scenario: Началась следующая wave

- **WHEN** encounter меняется intermission→combat
- **THEN** cards исчезают, role controls начинают neutral и требуют свежего пользовательского input

#### Scenario: Замок уничтожен

- **WHEN** encounter становится defeated
- **THEN** controller прекращает scheduler/gameplay messages и показывает final wave/score
