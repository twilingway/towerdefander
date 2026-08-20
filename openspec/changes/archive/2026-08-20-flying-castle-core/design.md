## Context

Production сейчас реализует protocol v4 и авторитетный sector tower-defense, сохранённый коммитом
`00c3ab7`. Новый продуктовый запрос меняет основной цикл: один летающий замок движется по большой
top-down карте, а три browser controllers одновременно управляют движением, пушкой и щитом. Сетевой
транспорт, reconnect и схема display + controllers остаются полезными, но domain state, protocol и
UI несовместимы с v4.

Первый slice нужен для проверки самого важного риска — ощущается ли совместное realtime-управление
понятным и отзывчивым. Поэтому карта и объекты рисуются Phaser primitives, а collision, enemies,
damage и progression намеренно отложены. Server остаётся единственным источником истины. Game-core
не использует Phaser, React, DOM, network, timers, wall clock или случайность.

## Goals / Non-Goals

**Goals:**

- Создать запускаемую из локальной сети или интернета комнату ровно для трёх стабильных ролей.
- Дать pilot управление WASD/arrows или virtual stick, gunner — aim + fire, shield — aim + hold
  protect.
- Выполнять детерминированную server-authoritative симуляцию 20 Hz и безопасно обрабатывать потерю
  inputs.
- Показать на общем экране прокручиваемую Phaser-карту, замок, пушку, щит и снаряды примитивами.
- Сохранить reconnect, strict boundary validation, role authorization и независимый от message rate
  fire cooldown.

**Non-Goals:**

- Enemies, damage, collisions, victory/defeat, waves, bosses, economy, upgrades или roguelike
  progression.
- Procedural generation, persistence, matchmaking, accounts, bitmap art или sound.
- Client prediction trusted state; Android native changes; новые production dependencies.

## Decisions

### 1. Protocol v5 полностью заменяет defense transport

`PROTOCOL_VERSION=5`. Общие domain types:

- `CrewRole = "pilot" | "gunner" | "shield"`;
- `PlayerView = { playerId, playerName, role, ready, connected }`;
- strict create `{protocolVersion:5, role:"display"}` и join options без capacity/requested role;
- strict `controller:ready` содержит `{protocolVersion,roomId,playerId}`;
- continuous messages `pilot:input`, `gunner:input`, `shield:input` содержат envelope
  `{protocolVersion,roomId,playerId,sequence}` и normalized vector; gunner также `firing`, shield —
  `active`.

Payload identity сверяется с authenticated Colyseus client, но никогда не заменяет server connection
identity. Protocol version проверяется до остальных ошибок. Из v4 удаляются sector, gate, wave,
treasury, repair, upgrade и airstrike fields/messages. Старые вкладки получают `protocol_mismatch`.

Рассмотрено сохранение v4 union в одном runtime: отклонено, потому что оно удваивает StateView и
lifecycle paths, не давая ценности первому playable slice. Rollback выполняется Git-коммитом
предыдущего этапа.

### 2. Две строгие проекции состояния

Server schema хранит shared room/player state и active world. `DisplayRoomView` получает полный
snapshot: `tick`, `worldWidth`, `worldHeight`, castle transform, turret angle, shield angle/active,
decorative obstacles и projectiles. `ControllerRoomView` получает room/roster, own player/role и
компактный system snapshot castle + turret + shield, но StateView исключает obstacles/projectiles.
React adapters декодируют именно соответствующую strict Zod schema; они не создают пустые
placeholders отсутствующих display fields.

World cross-field validation требует finite numbers, castle inside bounds, unique projectile IDs и
каждый projectile внутри разумного padded world range. Это предотвращает попадание NaN/Infinity в
Phaser camera.

Рассмотрена одна общая projection: отклонена из-за лишнего трафика на телефоны и смешения security
contract.

### 3. Чистая симуляция flying castle

Новый `packages/game-core/src/flyingCastle.ts` экспортирует:

- `createFlyingCastleConfig()` с reversible tuning defaults;
- `createFlyingCastleState(config)`;
- `applyPilotInput`, `applyGunnerInput`, `applyShieldInput`;
- `advanceFlyingCastle(state, config)`.

Config: fixed step 50 ms, world 2400×1600, castle speed 320 units/s, castle radius 52, timeout 250
ms, projectile speed 720 units/s, lifetime 1500 ms, radius 8 и cooldown 250 ms. Core state хранит
integer tick, trusted vectors/flags, received ticks и следующий projectile sequence; sequence
watermarks принадлежат только Room transport layer. Карта имеет детерминированный статический список
decorative obstacles; seed пока не нужен.

Vectors сначала проверяются protocol schema, затем pure helper ограничивает длину единицей. Pilot
velocity напрямую следует input и становится нулевой при neutral. Aim zero сохраняет предыдущий
угол; default направлен вправо. `age >= 5 ticks` обнуляет pilot movement и выключает shield,
сохраняя углы. Castle clamp учитывает radius. При свежем `firing=true` projectiles создаются у края
castle по последнему server-accepted turret angle только когда simulation-tick cooldown завершён;
duplicate inputs не влияют на rate. Они двигаются fixed steps и удаляются по lifetime или выходу за
padded world bounds.

Рассмотрены Phaser physics и client-authoritative transforms: отклонены, потому что они нарушают
deterministic core и дают разный результат display/controller/network timing.

### 4. Room lifecycle и input pipeline

Роли назначаются по первому свободному слоту в порядке pilot → gunner → shield; клиент не
запрашивает роль. Match стартует только когда все три connected и ready. Active replacement после
30-second expiry занимает конкретную освободившуюся роль и сразу ready. Неожиданный disconnect
немедленно нейтрализует input, затем оставляет identity/role в roster на grace period; consented
leave освобождает role сразу. Reconnect сохраняет identity/role и сбрасывает per-connection sequence
watermark, поэтому первый valid packet принимается независимо от старого sequence. Display expiry
останавливает timer и dispose room, чтобы active session не оставалась бессрочно без общего экрана.
Grace period по умолчанию и в production profile равен 30 секундам; test harness MAY временно
уменьшать его через environment, не изменяя production default и protocol semantics.

Room `maxClients=5`: display + три controllers + один spare transport seat для typed `room_full`.
Message limit 20/s на connection. Controller делает leading send только если предыдущий send был не
менее 50 ms назад; более частые изменения coalesce latest value к следующему 50 ms slot. Heartbeat
100 ms отправляется только при отсутствии более свежего send. Blur, visibility hidden, pointercancel
и unmount ставят neutral как latest value с максимально ранней допустимой отправкой.

Handler pipeline: protocol → strict parse → connection type → roomId/playerId → assigned role →
active phase → sequence → core input mutation → state sync. Continuous duplicate/out-of-order
packets молча игнорируются. Input в lobby возвращает `invalid_phase` и не записывает sequence. Fire
не является resource-spending discrete action: latest boolean `firing` входит в sequenced gunner
input, поэтому room не хранит action journal, а cooldown применяется чистым core независимо от
message rate.

### 5. React controllers разделены по role, частые значения живут в refs

Lobby shell и connection state остаются React. После назначения role controller динамически
показывает один panel:

- pilot: keyboard map WASD/arrows и `VirtualStick`;
- gunner: pointer/mouse aim, arrow fallback, `VirtualStick`, hold Fire и Space/LMB;
- shield: pointer/mouse/arrow aim, `VirtualStick`, hold Protect и Space/LMB.

Текущий vector и keys хранятся в refs; React state обновляет только видимое положение stick knob и
connection status. Один scheduler читает refs, выполняет 50 ms coalescing и 100 ms heartbeat. Это
избегает render на каждый network tick, pointermove flood и stale closure. Phaser остаётся dynamic
import внутри display canvas; React владеет HUD и role labels.

### 6. Phaser runtime только визуализирует snapshots

Новый `FlyingCastleRuntime` создаёт один Phaser Game с logical viewport 1280×720, world bounds
2400×1600 и camera lerp follow. Scene рисует grid, decorative rectangles/circles, castle circle,
turret rectangle/line, shield arc и projectile circles. Никакие bitmap assets старого замка не
загружаются.

Runtime получает immutable display snapshots через adapter. Между snapshots он визуально lerp-ит
transforms и на каждом новом snapshot корректируется к server target. Projectile display objects
keyed by projectileId создаются и удаляются по snapshot. Runtime не создаёт projectile по клику и не
запускает gameplay physics. Phaser canvas содержит только world; React HUD показывает игроков, роли,
status и room join information.

### 7. Миграция OpenSpec и production

`support-2-to-6-defenders` описывает уже сохранённый v4, но checklist не reconciled. Он архивирован
с `--skip-specs` как superseded, а canonical v3 requirements удаляются/заменяются этим v5 change.
Это позволяет итоговой canonical specification описывать только новый режим. Перед финальным archive
применяется dry-run всех delta specs.

## Risks / Trade-offs

- [Network jitter делает управление рваным] → heartbeat 100 ms, snapshot interpolation и 250 ms
  safety timeout.
- [Display interpolation отстаёт от authority] → небольшой lerp без prediction; новый snapshot
  всегда корректирует target.
- [Android TV слабее desktop] → только Graphics primitives, bounded projectile count, один Phaser
  instance и compact HUD.
- [Headless room продолжает жить после ухода display] → display имеет 30-second grace, затем server
  останавливает timer и dispose room.
- [Три обязательных игрока усложняют одиночное тестирование] → локально используются три browser
  tabs/contexts; dev-only bots не добавляются в production contract.
- [Нет collision, поэтому «препятствия» выглядят проходимыми] → UI называет их декорациями;
  collision добавляется только вместе с observable gameplay rules.
- [Breaking v5 требует одновременного обновления] → monorepo builds server/display/controller
  вместе, v4 получает protocol_mismatch, rollback — commit `00c3ab7`.

## Migration Plan

1. Зафиксировать superseded status v4 change и подтвердить archive dry-run нового delta.
2. Сначала добавить protocol v5 и pure core с unit tests.
3. Перевести server schema/room и покрыть network lifecycle/authorization tests.
4. Перевести controller adapters/UI и display adapters/Phaser runtime.
5. Обновить E2E, network smoke, docs и example flows; выполнить `pnpm check` и `pnpm spec:validate`.
6. Запустить server + оба Vite clients и вручную проверить display + три controller contexts.
7. После review закрыть checklist, архивировать change, commit; при критической регрессии вернуть
   `00c3ab7`.

## Open Questions

Нет блокирующих вопросов для первого slice. Tuning speed, colors и размеров reversible и будет
корректироваться после ручного playtest. Enemies, collision/damage и procedural map требуют
отдельного согласованного OpenSpec change.
