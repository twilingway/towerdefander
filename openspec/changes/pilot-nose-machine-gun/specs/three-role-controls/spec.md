## MODIFIED Requirements

### Requirement: Continuous intents упорядочены

Каждый continuous intent SHALL содержать current protocolVersion, roomId, playerId и монотонный safe
integer `sequence`. Server SHALL применять только sequence больше последнего принятого для
actor/input type. Duplicate или out-of-order sequence SHALL игнорироваться без mutation и SHALL NOT
менять angular target. Shield `active` SHALL быть absolute desired state: handler только заменяет
latest state, а energy расходуется один раз на authoritative simulation tick, поэтому duplicate
packet SHALL NOT умножать расход. Pilot `mgFiring` SHALL быть таким же absolute desired state внутри
того же сообщения `pilot:input`: duplicate packet не создаёт дополнительных fire requests и не
меняет heading target. При disconnect server SHALL немедленно задать безопасный intent: pilot
movement target zero и mgFiring false, gunner firing false, shield OFF, а также отменить
gunner/shield angular target и pilot heading target через trusted core transition. После reconnect
sequence watermark SHALL сбрасываться, первый packet sequence 1 SHALL приниматься, shield SHALL
оставаться OFF до нового ручного включения, pilot mgFiring SHALL начинаться с false, а отменённые
angular/heading targets SHALL NOT восстанавливаться. При переходе combat→intermission server SHALL
выполнить ту же trusted neutralization и SHALL NOT переносить held input в следующую wave.

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

#### Scenario: Pilot отключился со спуском пулемёта

- **WHEN** pilot connection закрывается при удержанном `mgFiring=true` и незавершённом повороте носа
- **THEN** server немедленно задаёт mgFiring false, очищает pending MG fire request и отменяет
  heading target; reconnect начинается с mgFiring=false без delayed projectile

### Requirement: Pilot поддерживает keyboard и touch stick

Controller SHALL отправлять leading vector немедленно, если после прошлого send прошло не менее 50
ms; более частые changes SHALL coalesce latest value к следующему 50 ms slot. Heartbeat SHALL
отправляться через 100 ms только если после прошлого send не было нового packet, поэтому continuous
поток не превышает 20 messages/s. Pilot SHALL преобразовывать WASD/arrow keys и captured virtual
stick в одинаковый movement vector. Pilot SHALL иметь второй hold-контрол спуска носового пулемёта:
pointerdown внутри правой fire-зоны либо non-repeat keydown Space SHALL установить `mgFiring=true`,
а pointerup/pointercancel/lost capture либо keyup Space SHALL отправить `mgFiring=false`; на панели
пилота Space является hold-спуском, а не toggle. Gunner и shield SHALL менять aim только после
pointerdown внутри собственного virtual stick и во время drag; captured stick или keyboard direction
SHALL задавать absolute target bearing, а magnitude SHALL NOT масштабировать angular speed. Touch
tap внутри stick SHALL отправить ненулевой bearing до neutral, после чего core SHALL завершить
latched traverse. Обычный mousemove над panel SHALL ничего не менять. Keyboard arrows SHALL
оставаться desktop fallback. Gunner Fire SHALL быть hold-кнопкой. Shield button и Space на панели
shield SHALL переключать absolute active один раз на non-repeat click/keydown; pointerup SHALL NOT
выключать shield. Blur/visibilitychange SHALL нейтрализовать pilot movement, pilot mgFiring и gunner
fire, но SHALL NOT подменять ручное shield ON/OFF состояние. Controller SHALL NOT locally ease или
predict trusted angle.

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

#### Scenario: Pilot держит спуск пулемёта

- **WHEN** pilot удерживает pointer внутри правой fire-зоны либо Space во время combat
- **THEN** controller отправляет `mgFiring=true` в ближайшем разрешённом slot и heartbeat'ах, а
  после release ближайший packet содержит `mgFiring=false`

#### Scenario: Короткий тап по спуску

- **WHEN** pilot нажимает и отпускает fire-зону раньше следующего разрешённого send slot
- **THEN** controller сохраняет rising edge, отправляет `mgFiring=true` в ближайшем slot и только
  затем `mgFiring=false`, не превышая 20 messages/s

#### Scenario: Панель пилота потеряла фокус

- **WHEN** blur либо visibilitychange происходит при удержанных movement и спуске пулемёта
- **THEN** controller нейтрализует movement vector и mgFiring, а после возврата фокуса управление
  начинается с neutral state без автоматического огня

## ADDED Requirements

### Requirement: Controller показывает состояние носового пулемёта

Во время combat панель пилота SHALL показывать authoritative machineGun view: шкалу heat/capacity и
overheat-индикатор. Authoritative snapshot является единственным источником состояния перегрева;
controller SHALL NOT локально моделировать нагрев или остывание. При `overheated=true` fire-зона и
шкала SHALL показывать overheat-состояние, при этом local desired `mgFiring` SHALL оставаться без
изменений: удерживаемый спуск продолжает отправляться heartbeat'ами, а возобновление огня после
rearm происходит на server без нового пользовательского действия.

#### Scenario: Шкала перегрева отображается

- **WHEN** combat snapshot содержит machineGun view с heat 40 из capacity 100 и overheated=false
- **THEN** панель пилота показывает шкалу 40/100 и активную fire-зону без локальной поправки heat

#### Scenario: Перегрев под удержанием спуска

- **WHEN** snapshot меняет overheated false→true при удержанном `mgFiring=true`
- **THEN** UI показывает overheat-состояние, продолжает отправлять `mgFiring=true`, а после
  authoritative overheated true→false огонь возобновляется без нового нажатия
