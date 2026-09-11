# three-role-controls

## ADDED Requirements

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

## MODIFIED Requirements

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

## REMOVED Requirements

### Requirement: Комната имеет три стабильные роли

**Reason**: раздача ролей больше не подразумевает три занятых места — их число задаёт размер экипажа
комнаты.

**Migration**: поведение полного экипажа сохранено требованием «Роли раздаются в пределах размера
экипажа» при размере 3, включая порядок ролей, сохранение role при reconnect и замену истёкшей роли.
