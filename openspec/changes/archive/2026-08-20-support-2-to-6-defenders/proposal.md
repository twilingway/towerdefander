> **Status: superseded on 20 August 2026.** Реализация protocol v4 сохранена коммитом `00c3ab7`, но
> пользователь изменил основную концепцию на flying-castle co-op. Невыполненные checklist items
> намеренно не отмечаются завершёнными; change не должен архивироваться как готовый продуктовый
> этап. Его требования заменяет `flying-castle-core` / protocol v5.

## Why

Продукт заявлен для 2–6 игроков, но текущие protocol, room, game-core и Phaser layout жёстко
ограничены двумя игроками и двумя секторами. Масштабирование должно сохранить авторитетность,
reconnect и читаемость телевизионного поля, а не сводиться к добавлению нарисованных дорог.

## What Changes

- Display выбирает вместимость комнаты от 2 до 6 игроков до её создания; настройка становится
  неизменяемой и публичной.
- Сервер создаёт стабильные места/сектора `0..playerCapacity-1`, запускает матч только когда все
  места заняты подключёнными готовыми игроками и сохраняет sector identity при
  reconnect/replacement.
- **BREAKING**: protocol повышается до v4; схемы room/player/game получают динамические коллекции до
  шести элементов и `playerCapacity`.
- Game-core принимает `sectorCount=2..6`, создаёт динамические сектора и одинаково применяет
  spawn/attack/movement/gate defeat/actions ко всем дорогам.
- Пять волн используют симметричный per-sector spawn template; в пятой волне каждый сектор получает
  своего босса.
- Общая экономика масштабируется по числу игроков: стартовая казна `25 × sectorCount`, награды и
  цены за одну сущность не меняются, общий airstrike сохраняет требование 100 заряда.
- Controller показывает до шести секторов. Сектора образуют кольцо, а airstrike можно направить в
  свой, левый или правый соседний сектор.
- Action journal связывает `actionId` с actor и полным намерением, чтобы коллизия другой команды или
  цели не могла воспроизвести чужой outcome.
- Display получает валидируемый code-native layout для каждого количества 2–6. Более длинные дороги
  меняют только визуальную кривую; authoritative `pathLength`, speed и время прохождения не
  меняются.
- Отдельный последующий change создаст пять согласованных hand-painted background assets с точным
  числом дорог; этот change сначала доказывает full-stack корректность на code-native layouts.

## Capabilities

### New Capabilities

- `configurable-room-capacity`: выбор неизменяемой вместимости, admission/start rules и стабильные
  места для 2–6 игроков.
- `multi-sector-layout-catalog`: валидируемые code-native layout manifests для 2–6 дорог и
  zoomed-out камеры.

### Modified Capabilities

- `shared-room-session`: protocol v4, до шести players/sectors, публичная capacity,
  reconnect/replacement и state visibility.
- `deterministic-defense-loop`: динамические 2–6 секторов вместо tuple из двух.
- `wave-campaign`: симметричные per-sector waves и boss policy для каждого количества игроков.
- `shared-defense-economy`: формула стартовой казны и действия владельца динамического сектора.
- `cooperative-airstrike`: ring-neighbor topology и target существующего соседнего сектора.
- `visual-battlefield-rendering`: выбор layout по authoritative capacity и длинные согласованные
  траектории.

## Impact

- Изменяются `packages/game-core`, `packages/protocol`, Colyseus room/state, display, controller,
  smoke и E2E.
- Открытые protocol v3 вкладки несовместимы и получают `protocol_mismatch`; требуется единый deploy
  server/display/controller.
- Новые production-зависимости, persistence и deployment-инфраструктура не требуются.
- Hand-painted assets для 3–6 игроков намеренно не входят в этот change, чтобы отделить сетевую и
  игровую миграцию от художественного approval.

## Approved Decisions

Пользователь подтвердил следующий профиль перед созданием specs/design/tasks:

1. Display выбирает точное количество `2..6`; по умолчанию 2. После создания комнаты изменить его
   нельзя.
2. Матч стартует автоматически только при `N` подключённых и готовых игроках.
3. Каждый сектор получает одинаковое расписание врагов и собственного босса в пятой волне.
4. Стартовая казна равна `25 × N`, цены и награды за одну сущность остаются прежними.
5. Общий airstrike по-прежнему требует 100 заряда; удар доступен для своего, левого или правого
   соседнего сектора в кольце.
6. Более длинные дороги пока являются только визуальным zoom-out и не меняют длительность пути.
7. Сначала реализуется protocol v4 с code-native layouts; затем отдельным change генерируются пять
   рисованных сцен для 2–6 дорог.
