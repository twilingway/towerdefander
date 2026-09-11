# shared-room-session Specification

## Purpose

TBD - created by archiving change bootstrap-network-vertical-slice. Update Purpose after archive.

## Requirements

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

### Requirement: Reconnect сохраняет authoritative wave deadline и причину результата

Current-protocol projections SHALL публиковать `waveSecondsRemaining` для combat и nullable
`defeatReason`. Controller/display transport SHALL NOT владеть таймером и SHALL NOT останавливать
или продлевать его. Reconnect SHALL получить остаток текущего server deadline либо frozen terminal
reason.

#### Scenario: Controller возвращается в combat

- **WHEN** controller reconnect завершается до истечения wave deadline
- **THEN** controller получает текущую wave, актуальный остаток секунд и продолжает тот же run

#### Scenario: Controller возвращается после timeout

- **WHEN** controller reconnect завершается во время result после wave timeout
- **THEN** controller получает frozen `defeat/wave_timeout`, итоговый счёт и текущие rematch votes

#### Scenario: Старый клиент пытается войти

- **WHEN** v12 display или controller подключается к v13 room
- **THEN** server отклоняет соединение существующей ошибкой `protocol_mismatch` до mutation state

### Requirement: Процесс отказывает в комнате сверх своего предела

Сервер SHALL считать живые комнаты процесса и SHALL отказывать в создании новой, когда их число
достигло настраиваемого предела. Отказ SHALL происходить до появления комнаты и SHALL NOT
затрагивать уже идущие сессии: все комнаты процесса делят один event loop, поэтому принятая сверх
предела комната ухудшила бы частоту тика у всех сразу.

Отказ SHALL нести код `server_at_capacity`, отличимый от прочих причин отказа. Общий экран SHALL
показывать его текстом для игрока, а не кодом.

Освобождение комнаты SHALL возвращать место: следующая попытка создания после закрытия комнаты SHALL
проходить. Отказ SHALL NOT занимать место сам по себе.

#### Scenario: Создание сверх предела

- **WHEN** процесс уже держит предельное число комнат и приходит ещё один запрос на создание
- **THEN** запрос отклоняется с `server_at_capacity`, число живых комнат не растёт, а состояние
  существующих комнат не меняется

#### Scenario: Место освободилось

- **WHEN** одна из комнат закрывается и приходит новый запрос на создание
- **THEN** комната создаётся обычным порядком

#### Scenario: Отклонённый запрос не занимает место

- **WHEN** подряд приходит несколько запросов на создание сверх предела, а затем комната закрывается
- **THEN** первая же следующая попытка создаёт комнату, то есть отказы не уменьшили доступную
  ёмкость

### Requirement: Симуляция идёт по реальному времени, а не по срабатываниям таймера

Server SHALL продвигать authoritative симуляцию на столько целых fixed steps, сколько укладывается в
накопленное реальное время, а не на один шаг за срабатывание таймера. Остаток накопленного времени
SHALL переноситься на следующее срабатывание, поэтому за длинный отрезок игровое время SHALL
совпадать с реальным независимо от кванта таймера хоста. За одно срабатывание SHALL выполняться не
больше ограниченного числа шагов, а накопленное сверх этого потолка SHALL отбрасываться.
`fixedStepMs` SHALL оставаться 50 мс, и каждый шаг SHALL оставаться прежним детерминированным
переходом.

#### Scenario: Таймер хоста грубее шага

- **WHEN** таймер ОС будит комнату реже, чем раз в `fixedStepMs` — например раз в 62 мс
- **THEN** за секунду выполняется 20 шагов, часть срабатываний выполняет два шага подряд, и игровое
  время не отстаёт от реального

#### Scenario: Одно срабатывание сильно задержалось

- **WHEN** очередное срабатывание приходит на полсекунды позже предыдущего
- **THEN** комната выполняет не больше потолка шагов, отбрасывает накопленный сверх него остаток и
  продолжает с текущего момента, не догоняя лавиной шагов

#### Scenario: Wall-clock дедлайн волны

- **WHEN** deadline волны наступает во время боя
- **THEN** он срабатывает с точностью срабатывания цикла симуляции, а не с точностью публикации
  патча

### Requirement: Protocol v14 публикует общую economy state и восстанавливает votes

Strict v14 display/controller projections SHALL одинаково публиковать score, credits, nullable
team-upgrade offer, три role votes и nullable purchase selection. Offer/votes SHALL существовать
только в intermission; combat/result SHALL не публиковать активный offer. Reconnect SHALL получать
current balance/offer/votes/countdown без продления intermission. v13 client SHALL получить
существующий `protocol_mismatch` и SHALL NOT войти в v14 room.

#### Scenario: Controller вернулся в intermission

- **WHEN** controller reconnect завершается до 30-секундного deadline
- **THEN** он получает тот же offer, актуальный countdown, все votes и revision своего role slot

#### Scenario: Replacement занял role

- **WHEN** reservation истекла и replacement получает role с существующим vote
- **THEN** projection показывает этот role vote, а replacement может заменить его большим revision

#### Scenario: Старый client подключается

- **WHEN** v13 display либо controller пытается войти в v14 room
- **THEN** server отклоняет join/command как `protocol_mismatch` без economy mutation

### Requirement: Сервер запускает матч по размеру экипажа

Комната SHALL создаваться с размером экипажа 1, 2 или 3, полученным в опциях создания от display, и
SHALL публиковать его в обеих проекциях. Комната SHALL принимать не больше этого числа controller и
SHALL отказывать следующему. Server SHALL запускать simulation только когда все места экипажа заняты
и каждый игрок ready. Strict `controller:ready` SHALL содержать protocolVersion, roomId и playerId;
server SHALL сверять actor и принимать его только в lobby. Ready повторяем и идемпотентен. После
старта свежий controller может занять только истёкшую свободную role и становится ready
автоматически.

#### Scenario: Комната на одного игрока

- **WHEN** комната создана с размером экипажа 1 и единственный controller стал ready
- **THEN** phase становится `active`, создаётся spaceship state и запускается fixed-step timer

#### Scenario: Комната на двоих ждёт второго

- **WHEN** комната создана с размером экипажа 2, подключён и ready только один controller
- **THEN** phase остаётся `lobby`

#### Scenario: Комната на троих не изменилась

- **WHEN** комната создана с размером экипажа 3 и третья занятая role стала ready
- **THEN** phase становится `active`

#### Scenario: Лишний controller отклонён

- **WHEN** в комнату с размером экипажа 1 пытается войти второй controller
- **THEN** server отказывает в подключении, а идущая session не затрагивается

#### Scenario: Ready отправлен после старта

- **WHEN** controller отправляет `controller:ready` в active phase
- **THEN** server возвращает `invalid_phase` и world не изменяется

#### Scenario: Соло-игрок вернулся в grace period

- **WHEN** единственный игрок комнаты reconnect завершается до истечения grace period
- **THEN** playerId, role, размер экипажа и текущий world сохраняются

### Requirement: Комната принимает столько потоков ввода, сколько мест у клиента

Комната SHALL допускать от одного клиента столько continuous-потоков, сколько систем он ведёт, и
SHALL NOT разрывать соединение за их суммарную частоту. Игрок с одним местом в экипаже ведёт две
системы, поэтому его допустимый поток вдвое больше, чем у члена полного экипажа.

#### Scenario: Соло-игрок ведёт оба потока на полной частоте

- **WHEN** единственный игрок комнаты долго шлёт `pilot:input` и `gunner:input` с максимальной
  частотой обоих потоков
- **THEN** соединение остаётся живым, корабль идёт по вектору, а турель доворачивает

### Requirement: Комната создаётся с выбранным корпусом корабля

Комната SHALL создаваться с id корпуса из каталога пресета, полученным в опциях создания от display
наравне с размером экипажа, и SHALL публиковать этот id в обеих проекциях. Неизвестный id SHALL
отклонять создание комнаты, а не подставлять базовый корпус молча. Опции без id корпуса SHALL
означать базовый корпус, чтобы клиент предыдущей версии не ломался о новое поле.

Корпус SHALL быть свойством прогона: reconnect, replacement и rematch SHALL получать тот же корпус,
а дерево модулей на rematch SHALL начинаться заново.

#### Scenario: Комната создана на небазовом корпусе

- **WHEN** display создаёт комнату с id корпуса «клинок»
- **THEN** обе проекции называют этот корпус, корабль летает по его статам, а передышки предлагают
  его дерево

#### Scenario: Неизвестный корпус в опциях

- **WHEN** display создаёт комнату с id корпуса, которого нет в каталоге пресета
- **THEN** server отказывает в создании комнаты, а идущие комнаты не затрагиваются

#### Scenario: Reconnect в grace period

- **WHEN** игрок вернулся до истечения grace period
- **THEN** корпус, купленные модули и текущий offer сохранены

#### Scenario: Rematch на том же корпусе

- **WHEN** экипаж запускает rematch после поражения
- **THEN** корпус и размер экипажа сохраняются, а купленные модули и доступный тир сбрасываются в
  начало
