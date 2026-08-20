## MODIFIED Requirements

### Requirement: Continuous intents упорядочены

Каждый continuous intent SHALL содержать protocolVersion, roomId, playerId и монотонный safe integer
`sequence`. Server SHALL применять только sequence больше последнего принятого для actor/input type.
Duplicate или out-of-order sequence SHALL игнорироваться без mutation. Shield `active` SHALL быть
absolute desired state: handler только заменяет latest state, а energy расходуется один раз на
authoritative simulation tick, поэтому duplicate packet SHALL NOT умножать расход. При disconnect
server SHALL немедленно задать безопасный intent: pilot target zero, gunner firing false, shield
OFF. После reconnect sequence watermark SHALL сбрасываться, первый packet sequence 1 SHALL
приниматься, а shield SHALL оставаться OFF до нового ручного включения.

#### Scenario: Пакеты пришли не по порядку

- **WHEN** server после sequence 12 получает sequence 11
- **THEN** последний применённый control и sequence остаются от пакета 12

#### Scenario: Повторён shield ON

- **WHEN** один shield input с `active=true` доставлен дважды с одинаковым sequence
- **THEN** duplicate игнорируется, а energy уменьшается только обычным fixed-step drain

#### Scenario: Identity подменена

- **WHEN** controller указывает playerId другого соединения
- **THEN** server возвращает `identity_mismatch` и не записывает sequence

#### Scenario: Pilot отключился с зажатым направлением

- **WHEN** pilot connection закрывается во время движения
- **THEN** server немедленно обнуляет target vector, а core плавно тормозит замок

#### Scenario: Pilot восстановил соединение

- **WHEN** pilot reconnect завершён и новый transport отправляет sequence 1
- **THEN** server принимает packet для прежней role после сброса connection watermark

#### Scenario: Shield отключился

- **WHEN** shield controller теряет connection при активной защите
- **THEN** server немедленно выключает shield, energy начинает восстанавливаться, а reconnect не
  возвращает прежний ON state

### Requirement: Gunner fire зависит от состояния, а не частоты сообщений

`gunner:input` SHALL содержать aim vector, boolean `firing` и monotonic sequence. Gunner aim SHALL
меняться только от captured pointer внутри virtual stick или keyboard direction fallback. Server
SHALL хранить последний принятый input. Первый принятый rising edge `firing false→true` при
отсутствии pending request SHALL поставить ровно один fire request в pure core; request SHALL
сохраниться до ближайшего разрешённого authoritative cooldown tick и SHALL быть consumed одним
projectile даже если release пришёл раньше следующего tick. Дополнительные rising edges пока request
pending SHALL coalesce и не накапливать очередь. Удерживаемый `firing=true` SHALL продолжать cadence
по cooldown. Duplicate heartbeat или более частая доставка SHALL NOT ставить дополнительный request.

#### Scenario: Обычное движение мыши над controller

- **WHEN** gunner перемещает мышь или нажимает вне virtual stick и Fire button
- **THEN** controller не отправляет новый aim и turret angle не меняется

#### Scenario: Gunner тащит virtual stick

- **WHEN** primary pointer начинается внутри stick и перемещается при сохранённом pointer capture
- **THEN** controller отправляет нормализованный aim, а release возвращает vector zero без изменения
  последнего turret angle

#### Scenario: Gunner удерживает Fire

- **WHEN** primary pointer удерживается на Fire либо удерживается Space
- **THEN** firing остаётся true и projectile rate ограничен authoritative cooldown

#### Scenario: Firing heartbeat доставлен дважды

- **WHEN** одинаковый gunner heartbeat доставлен повторно с тем же sequence
- **THEN** duplicate игнорируется и не создаёт дополнительный fire request

#### Scenario: Gunner делает короткий click

- **WHEN** server принимает rising edge `firing=true` и последующий `firing=false` между двумя
  simulation ticks
- **THEN** core создаёт ровно один projectile на ближайшем tick с завершённым cooldown

#### Scenario: Короткий click попал в занятый send slot

- **WHEN** gunner нажимает и отпускает Fire раньше следующего разрешённого 50 ms send slot
- **THEN** controller сохраняет rising edge, отправляет `firing=true` в ближайший slot и только
  затем отправляет `firing=false`, не превышая 20 messages/s

#### Scenario: Несколько кликов во время cooldown

- **WHEN** первый click уже создал pending request, а до его consume приняты дополнительные rising
  edges
- **THEN** core сохраняет один pending request и создаёт один projectile на ближайшем eligible tick

#### Scenario: Gunner отпускает fire

- **WHEN** Fire получает pointerup, pointercancel, lost capture либо controller теряет focus
- **THEN** ближайший input содержит `firing=false`, hold-cadence прекращается, но не более одного
  уже принятого pending request MAY создать projectile

#### Scenario: Gunner отключился с pending request

- **WHEN** connection gunner закрывается до consume queued fire
- **THEN** server очищает pending request; reconnect начинается с `firing=false` и не создаёт
  отложенный projectile

### Requirement: Pilot поддерживает keyboard и touch stick

Controller SHALL отправлять leading vector немедленно, если после прошлого send прошло не менее 50
ms; более частые changes SHALL coalesce latest value к следующему 50 ms slot. Heartbeat SHALL
отправляться через 100 ms только если после прошлого send не было нового packet, поэтому continuous
поток не превышает 20 messages/s. Pilot SHALL преобразовывать WASD/arrow keys и captured virtual
stick в одинаковый vector. Gunner и shield SHALL менять aim только после pointerdown внутри
собственного virtual stick и во время drag; touch tap внутри stick SHALL задать направление, обычный
mousemove над panel SHALL ничего не менять. Keyboard arrows SHALL оставаться desktop fallback.
Gunner Fire SHALL быть hold-кнопкой. Shield button и Space SHALL переключать absolute active один
раз на non-repeat click/keydown; pointerup SHALL NOT выключать shield. Blur/visibilitychange SHALL
нейтрализовать pilot и gunner fire, но SHALL NOT подменять ручное shield ON/OFF состояние.

#### Scenario: Pilot нажимает W и D

- **WHEN** pilot удерживает W и D
- **THEN** controller отправляет нормализованный target вверх-вправо с новым sequence

#### Scenario: Pilot двигает touch stick

- **WHEN** pilot удерживает captured pointer внутри virtual stick
- **THEN** controller отправляет нормализованный movement vector и после release отправляет neutral

#### Scenario: Touch tap задаёт aim

- **WHEN** gunner или shield касается точки внутри stick и отпускает pointer
- **THEN** ненулевой aim отправляется до neutral vector, а core сохраняет заданный angle

#### Scenario: Shield button отпущен

- **WHEN** operator один раз нажимает кнопку OFF→ON и затем отпускает pointer
- **THEN** UI сохраняет ON, публикует `aria-pressed=true` и не отправляет автоматический OFF

#### Scenario: Shield полностью разрядился

- **WHEN** authoritative snapshot меняет shield с active=true на active=false при energy=0
- **THEN** controller один раз синхронизирует local desired state в OFF и отправляет accepted
  `active=false`, после чего следующий ручной tap при energy>0 отправляет новый ON

#### Scenario: Shield переключён клавишей

- **WHEN** operator нажимает Space и keyboard генерирует repeat events
- **THEN** active меняется ровно один раз до следующего физического keydown после keyup

#### Scenario: Pointermove приходит чаще server limit

- **WHEN** stick получает много pointermove events в течение 50 ms
- **THEN** controller отправляет не более одного leading packet и один coalesced latest packet после
  slot

#### Scenario: Управление отпущено

- **WHEN** pilot отпускает keyboard либо pointer, а gunner отпускает Fire
- **THEN** ближайший разрешённый packet содержит neutral movement либо `firing=false`

#### Scenario: Release произошёл внутри занятого slot

- **WHEN** release происходит раньше 50 ms после прошлого send
- **THEN** pending value заменяется neutral и следующий packet не содержит устаревший active input
