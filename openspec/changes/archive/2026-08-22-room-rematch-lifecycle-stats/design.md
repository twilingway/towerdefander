## Context

Protocol v8 сохраняет room после `defeated`, но terminal state допускает только reconnect: новый
забег требует новой комнаты. Display без ограничения удерживает lobby/result, кроме существующего
30-секундного reconnect grace после потери display. Оператор не видит безопасной сводки комнат.

Change выполняется после archive `tyrian-combat-roguelite-slice`, использует текущие Colyseus,
Express, Zod и Node crypto и не добавляет production dependencies. Сервер остаётся единственным
владельцем run, result, readiness, reset и disposal; clients отправляют только intents.

## Goals / Non-Goals

**Goals:**

- Повторно запускать чистый run в той же комнате после единогласной готовности трёх ролей.
- Защитить новый run от delayed/duplicate v8/v9 packets с помощью server-owned run epoch.
- Дать controller явный leave, display — close room, сохранив reconnect при сетевом разрыве.
- Ограничить lifetime lobby/result/пустых и любых комнат детерминированными deadline.
- Показать privacy-safe read-only статистику через Colyseus room metadata.

**Non-Goals:**

- Реализация условия победы, host migration, голосование большинством или сохранение прогресса.
- Возврат upgrades/score между run, public room browser или управление комнатами из dashboard.
- Multi-node deployment/новый driver, accounts/RBAC и TLS termination внутри Node process.
- Новые production dependencies.

## Decisions

### 1. Protocol v9 вводит общий run epoch и обобщённый terminal result

Root room snapshot получает `runNumber`: `0` означает lobby до первого run, первый запуск атомарно
переходит к `1`, каждый rematch увеличивает число на один. Gameplay, `upgrade:choose` и
`controller:ready` содержат snapshot `runNumber`. Create/join и latency pong не мутируют run и epoch
не требуют.

Публичный encounter использует terminal phase и nullable result `victory | defeat`; invariant:
result существует только в terminal phase, `defeat` требует HP=0, а `victory` требует HP>0. Оба
result замораживают combat state. Текущий HP=0 producer создаёт только `defeat`. `victory`
закрепляется в contract сейчас, но producer победы появится отдельным change. Room lifecycle
проверяет наличие terminal result, а не конкретное поражение.

Validation order: protocol/schema → connection/room/player/role → exact `runNumber` → phase →
sequence/action journal → mutation. Stale epoch возвращает actor-only `stale_run` и не двигает
sequence watermark, readiness или action journal. Sequence watermarks и bounded upgrade journals
очищаются при restart; действие идентифицируется `(runNumber, actionId)`, поэтому старый duplicate
безопасен, а reuse actionId в новом run не конфликтует. Clients при смене epoch очищают held input,
локальные sequences, pending actions и Phaser interpolation/entity cache.

Альтернатива — полагаться только на sequence/actionId — отклонена: delayed packet предыдущего run
может быть новее сброшенного watermark. Сохранение `defeated` как единственного terminal marker
отклонено, потому что вынудит дублировать rematch lifecycle для будущей победы.

### 2. Rematch — единогласный server-authoritative transition в той же Room

При входе в terminal server замораживает core, останавливает combat interval, нейтрализует controls
и сбрасывает readiness всех roster entries. `controller:ready` с текущим epoch идемпотентно ставит
готовность actor. Ready переживает краткий reconnect, но restart возможен только когда pilot, gunner
и shield заняты, connected и ready. Expired/consented leave удаляет readiness вместе с identity;
replacement получает освободившуюся role и `ready=false` даже в terminal.

Последний valid ready в одном JS event-loop вызывает ровно один guarded transition. Server создаёт
отличающийся от прошлого cryptographic uint32 seed, новый pure core state и атомарно:

- увеличивает `runNumber`;
- заменяет HP, score, wave, modifiers, offers, selections и dynamic entities;
- очищает per-run watermarks/journals и ставит roster readiness false;
- сохраняет roomId, display, identities, names, roles, connections и latency telemetry;
- синхронизирует Schema state и запускает один fixed-step interval.

Terminal timer отменяется только после успешного restart. Синхронная замена попадает в один Colyseus
patch; `runNumber` заставляет display не интерполировать сущности через границу run.

Альтернатива — создать новую Room и автоматически переподключить clients — отклонена: меняются join
credentials, reconnect tokens и роли, а transition перестаёт быть атомарным.

### 3. Явный leave отличается от transport failure

Controller button вызывает consented Colyseus leave и после завершения очищает локальные room/token
данные. Server немедленно освобождает identity/role; обычный reload, закрытие вкладки и network drop
идут через 30-second reconnect grace. Display button использует consented leave/close path; только
текущий display slot может инициировать его, после чего server broadcasts typed closing reason и
disconnects весь экипаж. Новая privileged HTTP mutation не создаётся.

Timeout disposal отправляет тот же v9 `room:closing` с enum reason, останавливает simulation,
очищает timers и выполняет `disconnect()` ровно один раз. Idempotent disposal guard защищает от
гонки нескольких deadline и `onLeave`.

### 4. Deadline независимы, а самый ранний всегда побеждает

Все deadline основаны на server wall clock/Colyseus clock, не на simulation tick:

- display transport loss: 30 секунд на reconnect; expiry закрывает room независимо от phase;
- never-started lobby: 15 минут от `onCreate`, отменяется навсегда первым стартом;
- terminal result: 10 минут от входа в terminal, отменяется rematch;
- no controllers: 5 минут после удаления последней connected или reserved controller identity;
- absolute lifetime: 4 часа от `onCreate`, никогда не продлевается.

Disconnected controller считается reserved, пока `allowReconnection` не завершился expiry. Чтобы
новая пустая lobby не закрывалась через 5 минут вместо согласованных 15, no-controller timer
вооружается только после того, как хотя бы один controller когда-либо вошёл, и затем roster стал
пуст. Fresh join отменяет этот timer. Result/lobby votes и reconnect не сдвигают соответствующий
fixed deadline. Метаданные публикуют ближайший applicable `expiresAt`; если deadline совпали, reason
выбирается стабильным приоритетом: explicit/display → absolute → phase → no-controller.

Timer callbacks сходятся в одном `disposeOnce(reason)`. Это проще и безопаснее одного постоянно
продлеваемого inactivity timer, который позволил бы бессрочно удерживать room.

### 5. Dashboard читает только whitelist Colyseus metadata

Room создаёт случайный stats-only identifier, не пригодный для join, и обновляет metadata только на
join/leave/reconnect, phase/run transition и deadline change, а не каждый 50-ms tick. Записи
содержат только stats id, status (`lobby|combat|intermission|result|display_grace|closing`),
connected/reserved controller counts, display-connected flag, created/status timestamps и ближайший
deadline. Metadata writes сериализуются, чтобы медленный старый write не перезаписал новый.

Express JSON `GET /stats/rooms.json` использует `matchMaker.query` и отображает строгий whitelist,
никогда не возвращая listing roomId, room code, names, IP, session/reconnect tokens, ping, seed или
game state. Totals считают rooms и connected controllers; display считается отдельно. HTML
`GET /stats/rooms` — статическая read-only страница, которая same-origin fetch обновляет раз в пять
секунд без gameplay WebSocket и mutations. Ответы имеют `Cache-Control: no-store`; DOM заполняется
через `textContent`.

При LocalDriver видны комнаты текущего process. После перехода на общий driver тот же query даст
multi-node aggregation без смены HTTP contract. Прямой registry живых Room objects отклонён: он
ломает multi-process семантику и создаёт дополнительный источник утечек.

### 6. Доступ к статистике fail-closed

Если `ROOM_STATS_PASSWORD` отсутствует, оба route разрешают только direct socket loopback
(`127.0.0.0/8`, `::1`, IPv4-mapped loopback) и игнорируют spoofable forwarding headers. Если
password задан, Basic Auth с фиксированным username `admin` обязателен для всех клиентов, включая
loopback; это не даёт локальному reverse proxy случайно обойти auth. Password сравнивается
constant-time, не логируется и не попадает в HTML/JSON.

Удалённый доступ поддерживается только через TLS reverse proxy; Node endpoint сам TLS не завершает.
Deployment docs должны запрещать публикацию прямого HTTP port. GET-only dashboard не получает room
control links и credentials. Альтернатива — публиковать route без auth или room code ради удобства —
отклонена как утечка admission secret.

## Risks / Trade-offs

- [Delayed input меняет новый run] → mandatory epoch проверяется до watermark/journal mutation.
- [Два ready или timers запускают restart/disposal дважды] → single-thread guarded transitions и
  idempotent `disposeOnce`.
- [Reset оставляет старые entities/upgrades] → новый pure state, clear/reconcile всех projections и
  client cache reset по epoch; room-level invariant tests.
- [Metadata writes приходят не по порядку или нагружают driver] → serialized writes только на
  lifecycle transitions, polling раз в пять секунд.
- [Dashboard раскрывает join/private data] → stats-only DTO и endpoint whitelist tests с
  запрещёнными field names/values.
- [Basic Auth передан по открытому HTTP] → remote route только за TLS reverse proxy; без password
  non-loopback fail-closed.
- [Absolute TTL прерывает активный бой] → visible remaining lifetime/closing reason; жёсткий cap
  сознательно важнее бесконечной room.
- [Android TV/display пропустит один atomic patch] → next authoritative snapshot содержит epoch и
  полный текущий state; UI не зависит от локального restart animation.

## Migration Plan

1. После archive текущего combat change ввести protocol v9 и strict rejection v8.
2. Обобщить terminal result и добавить deterministic clean-state reset tests.
3. Добавить room epoch validation, rematch/leave/disposal timers и race/reconnect tests.
4. Добавить metadata publisher, protected JSON/HTML routes и privacy/auth tests.
5. Подключить display/controller UI, cache reset и Playwright rematch без нового join.
6. Обновить example env/deployment docs, выполнить package checks, `pnpm check` и
   `pnpm spec:validate`, затем manual playtest и archive.

Rolling v8/v9 rooms не смешиваются: старые clients получают `protocol_mismatch`. Deploy требует
drain старых rooms или sticky routing к старому process до disposal. Rollback выполняется Git revert
и возврат к v8 только после drain v9 rooms; persisted migration отсутствует.

## Open Questions

Блокирующих product decisions нет. Точные тексты closing reason и визуальное оформление dashboard
остаются обратимыми UI-решениями внутри закреплённого contract.
