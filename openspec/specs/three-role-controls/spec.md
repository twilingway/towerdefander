# three-role-controls Specification

## Purpose

TBD - created by archiving change flying-castle-core. Update Purpose after archive.
## Requirements
### Requirement: Комната имеет три стабильные роли

Server SHALL назначать controller roles в порядке `pilot`, `gunner`, `shield` при входе и SHALL
сохранять role при reconnect. Player view SHALL публиковать role. Active replacement после expiry
SHALL получить именно освобождённую role.

#### Scenario: Три игрока входят по очереди

- **WHEN** три controller входят в новую room
- **THEN** они получают соответственно pilot, gunner и shield

#### Scenario: Pilot восстанавливается

- **WHEN** pilot reconnect выполняется в grace period
- **THEN** identity и role pilot сохраняются, а duplicate player не создаётся

#### Scenario: Истёкший gunner заменён

- **WHEN** gunner не восстановился за 30 секунд и новый controller входит в active room
- **THEN** replacement получает role gunner и текущий snapshot

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

### Requirement: Gunner fire зависит от состояния, а не частоты сообщений

`gunner:input` SHALL содержать aim vector, boolean `firing` и monotonic sequence. Gunner aim SHALL
меняться только от captured pointer внутри virtual stick или keyboard direction fallback. Server
SHALL хранить последний принятый input и absolute target bearing, а current angle SHALL вычисляться
только core. Первый принятый rising edge `firing false→true` при отсутствии pending request SHALL
поставить ровно один fire request в pure core; request SHALL сохраниться до ближайшего разрешённого
authoritative cooldown tick и SHALL быть consumed одним projectile даже если release пришёл раньше
следующего tick. Дополнительные rising edges пока request pending SHALL coalesce и не накапливать
очередь. Удерживаемый `firing=true` SHALL продолжать cadence по cooldown. Projectile SHALL
использовать current authoritative core angle на fire tick, а не target bearing. Duplicate heartbeat
или более частая доставка SHALL NOT ставить дополнительный request и SHALL NOT менять target.

#### Scenario: Обычное движение мыши над controller

- **WHEN** gunner перемещает mouse либо нажимает вне virtual stick и Fire button
- **THEN** controller не отправляет новый aim, turret target и current angle не меняются

#### Scenario: Gunner тащит virtual stick

- **WHEN** primary pointer drag внутри stick задаёт bearing
- **THEN** controller отправляет нормализованный aim, release возвращает vector zero, server меняет
  target, а current turret angle плавно следует к нему

#### Scenario: Gunner удерживает Fire

- **WHEN** gunner удерживает Fire либо Space во время traverse
- **THEN** firing остаётся true, projectile rate ограничен authoritative cooldown и projectiles
  выходят по current angle

#### Scenario: Firing heartbeat доставлен дважды

- **WHEN** одинаковый gunner heartbeat повторён с тем же sequence
- **THEN** duplicate игнорируется без дополнительного fire request или retarget

#### Scenario: Gunner делает короткий click

- **WHEN** server принимает rising `firing=true` и последующий false между simulation ticks
- **THEN** core создаёт ровно один projectile на ближайшем tick с завершённым cooldown по current
  turret angle

#### Scenario: Короткий click попал в занятый send slot

- **WHEN** gunner нажимает и отпускает Fire раньше следующего разрешённого send slot
- **THEN** controller сохраняет rising edge, отправляет `firing=true` в ближайший slot и только
  затем отправляет `firing=false`, не превышая 20 messages/s

#### Scenario: Несколько кликов во время cooldown

- **WHEN** pending request уже существует и до consume приходят новые rising edges
- **THEN** core сохраняет один pending request и создаёт один projectile на ближайшем eligible tick

#### Scenario: Gunner отпускает fire

- **WHEN** Fire получает pointerup, pointercancel, lost capture либо controller теряет focus
- **THEN** ближайший input содержит `firing=false`, hold-cadence прекращается, но не более одного
  уже принятого pending request MAY создать projectile

#### Scenario: Gunner отключился с pending request

- **WHEN** gunner disconnect происходит до consume queued fire
- **THEN** server очищает pending request и angular target; reconnect начинается с `firing=false`,
  не создаёт delayed projectile и не продолжает traverse

### Requirement: Pilot поддерживает keyboard и touch stick

Controller SHALL отправлять leading vector немедленно, если после прошлого send прошло не менее 50
ms; более частые changes SHALL coalesce latest value к следующему 50 ms slot. Heartbeat SHALL
отправляться через 100 ms только если после прошлого send не было нового packet, поэтому continuous
поток не превышает 20 messages/s. Pilot SHALL преобразовывать WASD/arrow keys и captured virtual
stick в одинаковый vector. Gunner и shield SHALL менять aim только после pointerdown внутри
собственного virtual stick и во время drag; captured stick или keyboard direction SHALL задавать
absolute target bearing, а magnitude SHALL NOT масштабировать angular speed. Touch tap внутри stick
SHALL отправить ненулевой bearing до neutral, после чего core SHALL завершить latched traverse.
Обычный mousemove над panel SHALL ничего не менять. Keyboard arrows SHALL оставаться desktop
fallback. Gunner Fire SHALL быть hold-кнопкой. Shield button и Space SHALL переключать absolute
active один раз на non-repeat click/keydown; pointerup SHALL NOT выключать shield.
Blur/visibilitychange SHALL нейтрализовать pilot и gunner fire, но SHALL NOT подменять ручное shield
ON/OFF состояние. Controller SHALL NOT locally ease или predict trusted angle.

#### Scenario: Pilot нажимает W и D

- **WHEN** pilot удерживает W и D
- **THEN** controller отправляет нормализованный target вверх-вправо с новым sequence

#### Scenario: Pilot двигает touch stick

- **WHEN** pilot удерживает captured pointer внутри stick
- **THEN** controller отправляет нормализованный movement vector и после release отправляет neutral

#### Scenario: Touch tap задаёт aim

- **WHEN** gunner либо shield касается точки внутри stick и отпускает pointer
- **THEN** ненулевой absolute bearing отправляется до neutral, а core завершает плавный traverse к
  target

#### Scenario: Shield button отпущен

- **WHEN** operator переключает shield OFF→ON и отпускает pointer
- **THEN** UI сохраняет ON, публикует `aria-pressed=true` и не отправляет автоматический OFF

#### Scenario: Shield полностью разрядился

- **WHEN** authoritative snapshot меняет shield active true→false при energy=0
- **THEN** controller один раз синхронизирует local desired state в OFF и отправляет accepted
  `active=false`, после чего следующий ручной tap при energy>0 отправляет новый ON

#### Scenario: Shield переключён клавишей

- **WHEN** operator нажимает Space с keyboard repeat events
- **THEN** active меняется ровно один раз до следующего физического keydown после keyup

#### Scenario: Pointermove приходит чаще server limit

- **WHEN** stick получает много pointermove за 50 ms
- **THEN** controller отправляет не более одного leading packet и один coalesced latest packet после
  slot

#### Scenario: Управление отпущено

- **WHEN** pilot отпускает keyboard либо pointer, а gunner отпускает Fire
- **THEN** ближайший разрешённый packet содержит neutral movement либо `firing=false` без локального
  изменения trusted angle

#### Scenario: Release произошёл внутри занятого slot

- **WHEN** pilot movement release происходит раньше 50 ms после прошлого send
- **THEN** pending movement value заменяется neutral и следующий packet не содержит устаревший
  active input; aim tap и короткий Fire сохраняют отдельный pulse-first порядок своих scenarios

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

### Requirement: Controller управляет готовностью к следующему run

В lobby кнопка ready SHALL готовить первый run с runNumber 0; в terminal result та же strict v9
ready command SHALL означать «Играть ещё» для текущего runNumber. Кнопка SHALL показывать
authoritative ready state, блокироваться после принятия и снова становиться false при следующем
terminal result. Combat/intermission SHALL не показывать rematch action.

#### Scenario: Игрок голосует после поражения

- **WHEN** gunner нажимает «Играть ещё» в result run 3
- **THEN** controller отправляет ready с runNumber 3 и показывает принятое authoritative ready

#### Scenario: Ready старого run задержался

- **WHEN** controller доставляет ready run 3 после старта run 4
- **THEN** UI получает `stale_run`, а готовность run 4 не меняется

### Requirement: Controller имеет явный выход из комнаты

Connected controller SHALL показывать доступное действие «Выйти из комнаты» отдельно от controls и
rematch. После подтверждения UI SHALL остановить heartbeat/input, очистить сохранённый reconnect
token, выполнить consented leave и вернуть join form. Cancel подтверждения SHALL не менять room.

#### Scenario: Игрок подтверждает выход

- **WHEN** pilot выбирает и подтверждает выход
- **THEN** transport выполняет consented leave, локальная session очищена и отображается join form

#### Scenario: Игрок отменяет выход

- **WHEN** pilot закрывает confirmation без согласия
- **THEN** connection, reconnect token, role и controls остаются прежними
