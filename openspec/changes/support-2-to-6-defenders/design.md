## Context

Town Defenders сейчас использует protocol v3 и моделирует ровно два сектора сквозным tuple:
runtime-схемы, детерминированное ядро, Colyseus room, controller и Phaser layout знают только
`sectorId=0|1`. Из-за этого добавление дороги только на display создало бы ложное состояние: дорога
существовала бы визуально, но не имела бы владельца, врагов, ворот и допустимых команд.

Изменение затрагивает доверенную сетевую границу. Сервер остаётся единственным владельцем capacity,
назначения секторов, ready/start transition, игрового состояния и результатов действий. Controller
передаёт только намерения. Game-core остаётся детерминированным и не зависит от Colyseus, React,
Phaser, DOM, wall clock или несеянной случайности.

Основные потребители: общий экран в desktop browser или Android TV WebView, 2–6 браузерных
контроллеров и сервер комнаты. Protocol v3 и v4 несовместимы, поэтому все три клиента должны
обновляться одним релизом.

## Goals / Non-Goals

**Goals:**

- позволить display выбрать неизменяемую вместимость комнаты от 2 до 6;
- сохранить стабильное соответствие игрока, сектора, дороги, ворот и башни;
- масштабировать симуляцию и волны на 2–6 секторов без недетерминированности;
- показать для каждой вместимости более длинные программные дороги, точно заканчивающиеся у ворот;
- сохранить компактную controller-проекцию и серверную авторитетность;
- определить проверяемые reconnect, replacement и idempotency правила.

**Non-Goals:**

- изменение авторитетной длины пути, скорости врагов или продолжительности прохождения;
- динамическое изменение capacity после создания комнаты;
- spectator/controllers сверх выбранного числа игроков;
- persistence матча после уничтожения room process;
- пять финальных hand-painted backgrounds — они будут отдельным OpenSpec change.

## Decisions

### Protocol v4 публикует неизменяемую capacity

`PROTOCOL_VERSION` повышается до 4. Strict `DisplayCreateOptions` обязан передать
`playerCapacity: 2..6`; fresh `DisplayJoinOptions` по существующему room ID не передаёт capacity, а
controller join не может задавать или изменять её. Create options повторно принимаются в `onJoin`
только при совпадении с room. До открытия channel ошибки возвращаются через
`ServerError(4000, code)`, причём несовпадающая версия имеет приоритет `protocol_mismatch`. Public
room view публикует capacity, а player/game collections принимают до шести элементов. `SectorId` на
границе имеет форму целого числа `0..5`, после чего room/core обязательно проверяют
`sectorId < playerCapacity`.

Альтернатива — отдельный room type для каждого N — отвергнута: она дублирует lifecycle и усложняет
совместимость клиентов.

### Места назначаются при входе и сохраняют identity

Room выделяет новому игроку минимальный свободный sector `0..N-1` уже в lobby. До старта матч
переходит только при ровно N подключённых готовых игроках. Неожиданно отключённое соединение
резервирует identity и сектор на 30 секунд. После истечения grace period в active новый игрок
занимает именно освободившийся сектор и считается ready, потому что матч уже идёт. В lobby
replacement проходит обычный ready flow. Finished не принимает новых игроков.

Альтернатива — перенумеровывать игроков при каждом входе — отвергнута: reconnect менял бы дорогу и
ломал ментальную модель владельца.

### Game-core строит динамические коллекции из sectorCount

`DefenseConfig.sectorCount` валидируется в диапазоне 2..6. Начальное состояние создаёт массивы
секторов и ворот через единый builder, а все transition проходят коллекции по sectorId. Prototype
waves задаются как один per-sector spawn template; при создании конфигурации он разворачивается
одинаково для каждого сектора. В пятой волне каждый сектор получает одного boss.

Начальная казна выводится ядром как `25 * sectorCount` и не является произвольным полем config.
Цены, награды за одного врага, `pathLength`, speed и airstrike threshold 100 остаются прежними.

Альтернатива — хранить пять вручную составленных полных расписаний для каждого N — отвергнута из-за
риска рассинхронизации баланса между дорогами.

### Секторы образуют кольцо для cooperative target

Владелец сектора `s` может направить airstrike в `s`, `(s - 1 + N) % N` или `(s + 1) % N`. Для N=2
множество дедуплицируется и даёт оба сектора. Для каждой публичной записи игрока server вычисляет
`airstrikeTargetSectorIds` в порядке `[self, left, right]` с удалением повторов; controller читает
поле собственной identity и не определяет доверенную topology самостоятельно. Для N=2 поле содержит
`[self, other]`. Room выводит trusted source sector и передаёт его в pure game-core ring helper,
который повторно проверяет target.

Альтернатива — разрешить любой сектор — отвергнута: при 5–6 игроках она убирает пространственное
сотрудничество и перегружает controller.

### Журнал действий связывает actionId с полным намерением

Pipeline равен parse/version → controller role → room/player identity → journal compare → business
validation/mutation → journal write. Запись journal хранит actor identity, canonical fingerprint
`{commandType,targetSectorId?}` и outcome. Точный повтор воспроизводит исходное наблюдаемое
поведение: accepted outcome снова не отправляет error, rejected outcome повторяет тот же
`server:error`; game state повторно не мутирует. Повтор того же `actionId` другим игроком, другим
command type или с другой целью отклоняется как `invalid_message` без переиспользования outcome и
без мутации. Envelope/identity/collision errors не журналируются. Journal живёт до room disposal,
как и в v3; конечная продолжительность матча и message rate limit ограничивают его рост.

Альтернатива — ключ только по `actionId` — отвергнута: коллизия могла вернуть результат чужого или
семантически другого действия.

### StateView разделяет display и controller данные

Protocol определяет отдельные strict `DisplayRoomView` и `ControllerRoomView` поверх общего base.
Display-only wrapper целиком помечается `@view(1)` и содержит enemies и `lastAirstrikeEffect`.
Controller получает capacity, roster с серверно вычисленными `airstrikeTargetSectorIds`, собственный
sector и общие агрегаты, но его decoded state вообще не имеет display-only полей. Это уменьшает
трафик до шести телефонов и не требует client adapters фабриковать пустые placeholders.

Обе проекции проверяют cross-field invariants: players не больше capacity; player sectors уникальны
и существуют; game имеет ровно N ordered contiguous sectors; owner, enemy, effect и target
references существуют. `airstrikeTargetAvailable` означает только наличие врага в секторе, а
окончательную доступность кнопки controller получает из stage, charge, собственного target list и
этого агрегата.

### Layout catalog отделён от авторитетной длины пути

Display содержит пять code-native manifests для capacity 2..6. Каждый manifest имеет ровно N
уникальных sector entries: cubic road, gate, tower, label и effect anchor. Road начинается у внешней
границы расширенной композиции и заканчивается ровно в gate anchor. Layout выбирается только по
server `playerCapacity` и валидируется при разработке/тестах.

Phaser переводит авторитетный `progress/pathLength` в нормализованный параметр кривой. Поэтому
визуальный zoom-out и более длинная экранная дорога не меняют симуляцию. Environment asset выбирает
отдельный capacity-keyed catalog: существующий WebP допускается только для capacity 2, а capacity
3..6 намеренно получают code-native fallback до следующего change. Hand-painted backgrounds будут
добавлены позже и обязаны использовать те же manifests.

Альтернатива — вычислять позиции произвольной радиальной формулой во время рендера — отвергнута:
ручные anchors лучше защищают центральный замок, HUD и читаемость на телевизоре.

### Производительность и совместимость

Максимум активных объектов возрастает примерно втрое. Phaser переиспользует scene primitives,
интерполирует только display enemies и не создаёт отдельный canvas на сектор. Layout остаётся
нормализованным 16:9 и масштабируется FIT/CENTER_BOTH для desktop и Android TV. Новые runtime
dependencies не добавляются.

Room `maxClients` равен `MAX_PLAYER_CAPACITY + 2`: display, шесть controllers и одно транспортное
место для типизированного `room_full`; бизнес-лимит остаётся выбранной capacity.

## Risks / Trade-offs

- [Слишком плотное поле при 6 секторах] → manifests резервируют центральную safe area и разнесённые
  label/tower anchors; browser tests проверяют 2, 4 и 6.
- [Рост CPU/трафика на Android TV] → controller projection остаётся компактной, display использует
  один canvas и существующую частоту snapshot.
- [Несогласованность capacity и массивов] → protocol проверяет пределы, server проверяет cross-field
  invariants, game-core валидирует `sectorCount`.
- [Старые вкладки v3] → сервер явно возвращает `protocol_mismatch`; deploy выполняется совместно.
- [Reconnect занял лишнее место] → зарезервированный сектор не входит в множество свободных до
  завершения grace period.
- [Программная графика временно проще рисованной] → функциональный change завершается на code-native
  layouts, затем отдельный change заменяет environment layers, не меняя контракты.

## Migration Plan

1. Обновить game-core и protocol v4 вместе с unit tests для N=2..6.
2. Обновить room lifecycle, StateView и сетевые tests.
3. Обновить display/controller и layout catalog.
4. Прогнать typecheck, lint, unit, smoke и browser matrix 2/4/6.
5. Одновременно перезапустить server/display/controller; старые v3 клиенты получают
   `protocol_mismatch` и должны обновить страницу.

Rollback выполняется возвратом всех компонентов к последнему protocol v3 commit. Смешанный deploy
v3/v4 не поддерживается и не является допустимым промежуточным состоянием.

## Open Questions

Нет открытых продуктовых решений для этого change. Художественный стиль и содержимое пяти
hand-painted backgrounds будут согласованы в отдельном change после проверки v4.
