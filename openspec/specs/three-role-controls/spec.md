# three-role-controls Specification

## Purpose

TBD - created by archiving change flying-castle-core. Update Purpose after archive.

## Requirements

### Requirement: Role ограничивает допустимые intents

Pilot SHALL отправлять только `pilot:input` и собственный `upgrade:choose`, gunner — `gunner:input`
и собственный `upgrade:choose`, shield — `shield:input` и собственный `upgrade:choose`. При размере
экипажа 1 игрок с role `pilot` SHALL дополнительно владеть `gunner:input`, потому что турель занята
им же. Server SHALL сверять connection identity и владение вводом до mutation; ни одна role SHALL
NOT выбирать offer другой role.

#### Scenario: Shield пытается двигать spaceship

- **WHEN** shield controller отправляет strict pilot input
- **THEN** server возвращает `role_mismatch` и spaceship state не меняется

#### Scenario: Gunner выбирает shield upgrade

- **WHEN** gunner controller отправляет strict command для current shield offer
- **THEN** server возвращает `role_mismatch` и selection/modifiers не меняются

#### Scenario: Display отправляет role intent

- **WHEN** display отправляет известный gameplay или upgrade message
- **THEN** server возвращает `not_controller` и не меняет мир

#### Scenario: Соло-игрок направляет турель

- **WHEN** единственный игрок комнаты с размером экипажа 1 отправляет strict `gunner:input`
- **THEN** server применяет ввод к турели

#### Scenario: Пилот полного экипажа направляет турель

- **WHEN** pilot в комнате с размером экипажа 3 отправляет strict `gunner:input`
- **THEN** server возвращает `role_mismatch` и турель не меняет target

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
поток не превышает 20 messages/s. Pilot SHALL вести корабль с клавиатуры как танк: клавиша газа даёт
тягу вдоль носа, а клавиши доворота вращают корпус независимо от газа. Captured virtual stick SHALL
по-прежнему задавать movement vector напрямую. Pilot SHALL иметь второй hold-контрол спуска носового
пулемёта: pointerdown внутри правой fire-зоны либо non-repeat keydown Space SHALL установить
`mgFiring=true`, а pointerup/pointercancel/lost capture либо keyup Space SHALL отправить
`mgFiring=false`; на панели пилота Space является hold-спуском, а не toggle. Gunner и shield SHALL
менять aim только после pointerdown внутри собственного virtual stick и во время drag; captured
stick или keyboard direction SHALL задавать absolute target bearing, а magnitude SHALL NOT
масштабировать angular speed. Touch tap внутри stick SHALL отправить ненулевой bearing до neutral,
после чего core SHALL завершить latched traverse. Обычный mousemove над panel SHALL ничего не
менять. Keyboard arrows SHALL оставаться desktop fallback. Gunner Fire SHALL быть hold-кнопкой.
Shield button и Space на панели shield SHALL переключать absolute active один раз на non-repeat
click/keydown; pointerup SHALL NOT выключать shield. Blur/visibilitychange SHALL нейтрализовать
pilot movement, pilot mgFiring и gunner fire, но SHALL NOT подменять ручное shield ON/OFF состояние.
Controller SHALL NOT locally ease или predict trusted angle.

#### Scenario: Pilot держит газ и доворот

- **WHEN** pilot удерживает газ и клавишу доворота
- **THEN** controller отправляет вектор полной длины по новому курсу, а корпус продолжает
  разворачиваться, пока клавиша нажата

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

### Requirement: Controller показывает собственный upgrade choice

Во время intermission controller SHALL скрыть/disable realtime role controls, показать authoritative
countdown, три cards только assigned role и current selection. Card SHALL показывать понятные effect
label/value и отправлять один strict `upgrade:choose` с новым UUID actionId. UI SHALL принимать
authoritative selection/modifiers как source of truth, безопасно повторять pending command после
reconnect и запрещать второй локальный выбор после accepted result. В combat controls SHALL
возобновиться с neutral local state; в `result`/`defeat` SHALL показываться final wave/score без
input.

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

#### Scenario: Spaceship уничтожен

- **WHEN** encounter становится `result` с outcome=`defeat`
- **THEN** controller прекращает scheduler/gameplay messages и показывает final wave/score

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

### Requirement: Controllers показывают срок волны и точную причину поражения

Каждый role controller SHALL во время combat показывать тот же authoritative wave countdown, что и
display. Terminal panel SHALL различать `spaceship_destroyed` и `wave_timeout`, сохраняя
существующий unanimous rematch flow.

#### Scenario: Все роли видят один срок

- **WHEN** pilot, gunner и shield подключены к одной combat wave
- **THEN** каждый controller получает и показывает один server-owned остаток времени волны

#### Scenario: Timeout не мешает rematch

- **WHEN** controller получает result с `defeatReason=wave_timeout`
- **THEN** panel сообщает об истечении времени и позволяет отправить обычный rematch ready один раз

### Requirement: Две touch-зоны работают независимо и соответствуют роли

Левый joystick SHALL отправлять pilot movement, gunner aim либо shield aim. Правая круглая
action-zone SHALL отправлять pilot machine-gun hold, gunner cannon hold либо один shield ON/OFF
toggle за завершённое нажатие. Зоны SHALL одновременно владеть разными pointerId; событие одной зоны
SHALL NOT отменять intent другой. Pointer cancel/lost capture, blur, visibility loss, disconnect и
выход из combat SHALL безопасно прекращать movement/fire; shield toggle SHALL оставаться устойчивым
и выключаться server disconnect neutralization, а не отпусканием пальца.

#### Scenario: Pilot движется и стреляет двумя пальцами

- **WHEN** pilot удерживает левый joystick вправо pointerId 1 и правую action-zone pointerId 2
- **THEN** outgoing latest intent одновременно содержит movement вправо и `mgFiring=true`

#### Scenario: Gunner наводится и стреляет двумя пальцами

- **WHEN** gunner удерживает aim вверх слева и fire справа
- **THEN** turret target обновляется вверх, а `firing=true` не отменяет aim pointer

#### Scenario: Shield переключён правой зоной

- **WHEN** shield operator завершает одно нажатие правой action-zone при достаточной energy
- **THEN** desired active меняется один раз и отпускание не создаёт обратный toggle

#### Scenario: Второй touch больше не отбрасывается

- **WHEN** левый touch уже является primary, а правый получает `isPrimary=false` с другим pointerId
- **THEN** правая action-zone всё равно принимает свой pointer и выполняет role action

#### Scenario: Fire pointer отменён системой

- **WHEN** browser отправляет pointercancel либо lostpointercapture для удерживаемого правого action
- **THEN** fire становится false, а левый joystick продолжает принадлежать своему pointerId

### Requirement: Клавиатурный танковый руль просит доворот, а не курс

В танковой схеме панель пилота SHALL отправлять намерение доворота и тягу вдоль носа, а не
абсолютный курс: клавиши доворота задают знак доворота, клавиша хода вперёд — положительную тягу,
клавиша хода назад — отрицательную. Отпущенная клавиша доворота SHALL отправлять нулевой доворот, и
гашение вращения SHALL оставаться за симуляцией. Панель SHALL NOT предсказывать точку остановки и
SHALL NOT вычислять запрашиваемый угол от авторитетного носа. Стик и схема `absolute` SHALL
продолжать отправлять вектор без намерения доворота.

Это требование заменяет предсказание точки остановки, добавленное изменением `helm-tuning`:
опережение курса и демпфирование остановки перестают влиять на танковую схему, потому что курс в ней
больше не запрашивается.

#### Scenario: Быстрый тап по клавише доворота

- **WHEN** пилот коротко нажимает и отпускает клавишу доворота, стоя на месте
- **THEN** корпус доворачивает в сторону нажатия и останавливается там, не возвращаясь в
  противоположную сторону, при любой задержке доставки

#### Scenario: Ход вперёд без доворота

- **WHEN** пилот удерживает только клавишу хода вперёд, ни разу не довернув с начала прогона
- **THEN** корабль идёт вдоль текущего носа, а нос SHALL NOT разворачиваться к какому-либо мировому
  направлению

#### Scenario: Ход назад

- **WHEN** пилот удерживает клавишу хода назад
- **THEN** корабль идёт вдоль носа в обратную сторону, а нос сохраняет своё направление

#### Scenario: Стик остаётся прежним

- **WHEN** пилот ведёт захваченный виртуальный стик
- **THEN** панель отправляет прежний вектор без намерения доворота, и корпус ведёт себя как раньше

### Requirement: Controller показывает authoritative feedback голосования

Все controllers SHALL показывать одинаковые три cards, credits и публичные role votes. Card actor
SHALL иметь pending state только до authoritative vote с ожидаемым revision либо actor-only error.
Accepted vote SHALL подсвечиваться и оставаться изменяемым до deadline; rejection SHALL снимать
pending и оставлять controls доступными для исправленного command.

#### Scenario: Server отклонил поздний vote

- **WHEN** controller получает `invalid_phase`, `action_not_available` либо `stale_action` для
  pending action
- **THEN** pending снимается, показывается понятная ошибка и следующий доступный vote не блокируется

#### Scenario: Другой игрок изменил голос

- **WHEN** shared projection меняет vote другой role
- **THEN** controller обновляет счётчики/маркеры без изменения собственного pending action

### Requirement: Роли раздаются в пределах размера экипажа

Server SHALL назначать controller roles в порядке `pilot`, `gunner`, `shield`, ограничившись первыми
местами по размеру экипажа комнаты, и SHALL сохранять role при reconnect. Player view SHALL
публиковать role, а обе проекции SHALL публиковать размер экипажа. Active replacement после expiry
SHALL получить именно освобождённую role. Незанятые системы SHALL вестись сервером, а не оставаться
без управления.

#### Scenario: Соло-игрок получает роль пилота

- **WHEN** единственный controller входит в комнату с размером экипажа 1
- **THEN** он получает role `pilot`, а щит ведётся сервером

#### Scenario: Двое входят по очереди

- **WHEN** два controller входят в комнату с размером экипажа 2
- **THEN** они получают соответственно `pilot` и `gunner`, а щит ведётся сервером

#### Scenario: Трое входят по очереди

- **WHEN** три controller входят в комнату с размером экипажа 3
- **THEN** они получают соответственно `pilot`, `gunner` и `shield`

#### Scenario: Истёкший gunner заменён

- **WHEN** gunner не восстановился за grace period и новый controller входит в active комнату с
  размером экипажа 3
- **THEN** replacement получает role `gunner` и текущий snapshot

### Requirement: Соло-панель ведёт корабль и турель

При размере экипажа 1 controller SHALL показывать соло-панель с двумя независимыми virtual stick —
курса и турели — и двумя hold-спусками: носового пулемёта и орудия наводчика. Стики SHALL работать
одновременно с разных касаний. Панель SHALL отправлять два независимых потока — `pilot:input` и
`gunner:input` — каждый со своей монотонной последовательностью. Панель SHALL предлагать две
раскладки: спуски над своими стиками и спуски широкими зонами по верхнему краю. Выбор раскладки
SHALL сохраняться между заходами на этом устройстве и SHALL NOT влиять на отправляемый ввод.

#### Scenario: Оба стика заняты одновременно

- **WHEN** соло-игрок держит один палец на стике курса, а второй на стике турели
- **THEN** корабль идёт по вектору курса, а турель доворачивает к своему bearing

#### Scenario: Два потока не глушат друг друга

- **WHEN** соло-панель отправляет `pilot:input` и `gunner:input` вперемешку
- **THEN** server применяет оба, потому что последовательность считается отдельно для каждого типа
  ввода

#### Scenario: Раскладка пережила перезаход

- **WHEN** соло-игрок выбрал раскладку с триггерами по верхнему краю и вернулся в комнату позже
- **THEN** панель открывается в выбранной раскладке

### Requirement: Клавиатура пилота водит корабль как танк

Клавиатура пилота SHALL вести корабль как танк, а не как абсолютное направление, при любом размере
экипажа: удержание газа SHALL отправлять вектор полной длины по текущему желаемому курсу, а клавиши
доворота SHALL вращать корпус непрерывно и независимо от газа. Вращение без газа SHALL идти с той же
угловой скоростью и SHALL NOT разгонять корабль заметно. Когда не нажата ни одна клавиша управления
курсом, панель SHALL отправлять нулевой вектор, поэтому корабль тормозит и сохраняет курс.
Отпускание клавиши доворота SHALL немедленно прекращать вращение: панель SHALL послать курс, равный
текущему носу, потому что нулевой вектор сохраняет прежнюю цель и корпус доворачивал бы до неё.
Space SHALL держать спуск носового пулемёта. При размере экипажа 1 стрелки SHALL задавать bearing
турели, а собственная клавиша SHALL держать её спуск; в остальных экипажах стрелки SHALL дублировать
руль, чтобы клавиатура не была строго худшим устройством. Ни одна клавиша SHALL NOT управлять двумя
системами сразу.

#### Scenario: Газ с доворотом

- **WHEN** соло-игрок удерживает газ и клавишу доворота вправо
- **THEN** нос непрерывно уходит вправо, а корабль идёт по новому курсу

#### Scenario: Доворот без газа

- **WHEN** соло-игрок удерживает только клавишу доворота
- **THEN** корпус продолжает вращаться, а корабль остаётся практически на месте

#### Scenario: Клавиша доворота отпущена

- **WHEN** игрок отпускает клавишу доворота на полном вращении
- **THEN** корпус останавливается почти сразу, а не доворачивает до прежней цели

#### Scenario: Газ отпущен

- **WHEN** соло-игрок отпускает газ и клавиши доворота
- **THEN** отправляется нулевой вектор, а желаемый курс сохраняется для следующего разгона

#### Scenario: Space в соло-панели

- **WHEN** соло-игрок удерживает Space на клавиатуре
- **THEN** огонь ведёт только носовой пулемёт, турель молчит

#### Scenario: Стрелки в соло-панели

- **WHEN** соло-игрок удерживает стрелку
- **THEN** турель доворачивает к её направлению, а корабль курс не меняет

#### Scenario: Стрелки у пилота полного экипажа

- **WHEN** pilot в комнате на двоих или троих удерживает стрелку вверх или вбок
- **THEN** она работает как газ или доворот, потому что турель ведёт другой игрок
