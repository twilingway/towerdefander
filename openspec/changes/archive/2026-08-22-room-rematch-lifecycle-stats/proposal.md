## Why

После поражения экипаж сейчас видит замороженный результат, но не может начать новый забег без
создания новой комнаты и повторного подключения. Одновременно подключённый display способен
неограниченно удерживать пустую lobby или terminal room, а у оператора сервера нет безопасной
страницы для наблюдения за количеством и состоянием комнат.

## What Changes

- После terminal result три controller сохраняют identity и role и могут отметить готовность «Играть
  ещё»; новый забег с новым server seed начинается в той же room только когда все три role заняты,
  подключены и готовы.
- Первый implementation path покрывает существующий `defeated` result. Будущая победа SHALL
  использовать тот же terminal/rematch lifecycle без повторного входа; добавление victory condition
  не входит в этот change.
- При terminal result readiness сбрасывается, simulation остаётся frozen до единственного
  authoritative restart. Fresh replacement может занять освободившуюся role после consented leave
  или reconnect expiry и затем проголосовать за rematch.
- Controller получает явное действие «Выйти из комнаты», которое освобождает role немедленно;
  display получает «Закрыть комнату», которое закрывает room для всего экипажа. Reload/network drop
  остаются recoverable и не считаются явным выходом.
- **BREAKING** Protocol v9 добавляет authoritative `runNumber` в snapshots и во все gameplay,
  upgrade и rematch commands. После рестарта пакеты старого run отклоняются до sequence/action
  mutation; это не позволяет delayed input или повторному actionId изменить новый забег.
- Добавляется bounded room lifecycle: 30 секунд grace для display reconnect, 10 минут для решения о
  rematch после terminal result, 15 минут для не запущенной lobby, 5 минут после исчезновения всех
  connected/reserved controller roles и абсолютный lifetime 4 часа. Active room с подключённым
  display и controller считается используемой, но остаётся ограниченной абсолютным lifetime.
- Добавляется read-only страница `/stats/rooms` и JSON endpoint на основе Colyseus room metadata:
  число комнат, подключённых игроков и анонимные per-room status/player counts. Room code, player
  name, IP, reconnect token, ping, run seed и gameplay state не публикуются.
- Страница обновляется без WebSocket gameplay connection и не имеет возможности создавать, закрывать
  или изменять room. Без `ROOM_STATS_PASSWORD` endpoint доступен только loopback-клиенту; удалённый
  доступ требует HTTP Basic Auth и TLS reverse proxy. Multi-node aggregation использует общий
  Colyseus driver, когда deployment перейдёт с текущего LocalDriver.
- Порядок lifecycle: этот change реализуется после reconciliation/archive активного
  `tyrian-combat-roguelite-slice`, поскольку изменяет его итоговый `shared-room-session` contract.
- Новые production dependencies не добавляются; существующий ready intent расширяется rematch
  semantics, но получает v9 run epoch.

## Capabilities

### New Capabilities

- `run-rematch-lifecycle`: terminal readiness, authoritative reset, fresh seed, explicit leave и
  bounded automatic disposal комнаты.
- `room-operations-dashboard`: безопасная read-only HTTP статистика активных комнат одного server
  process без join credentials и персональных данных.

### Modified Capabilities

- `shared-room-session`: terminal admission/reconnect меняются с reconnect-only на rematch и
  replacement lifecycle; вводятся run epoch и конкретные disposal deadlines.
- `three-role-controls`: `controller:ready` получает terminal rematch semantics, а controller —
  явный consented leave.
- `primitive-top-down-battlefield`: terminal overlay показывает readiness экипажа, rematch и явное
  закрытие комнаты display-владельцем.

## Impact

- `apps/server`: lifecycle timers, atomic run reset, room telemetry registry и Express `/stats` API.
- `packages/game-core`: чистый deterministic reset через создание нового state с explicit seed;
  алгоритм текущего забега не меняется.
- `apps/display` и `apps/controller`: rematch/exit UI и terminal readiness.
- `packages/protocol`: breaking переход v8 → v9, terminal result/runNumber и strict stale-run
  validation существующих и новых commands.
- Tests: core/room lifecycle, reconnect/duplicate ready, timer disposal, privacy-safe stats
  endpoint, display/controller UI и Playwright rematch без повторного join.
