## Why

Текущий realtime slice подтверждает совместное управление летающим замком, но в нём ещё нет угроз,
цели забега и развития ролей. Следующий этап должен превратить технический playground в первый
повторяемый top-down combat loop с Tyrian-inspired темпом волн, не привязываясь к финальному art или
campaign.

## What Changes

- Добавляется бесконечный забег на текущей свободной bounded-арене: combat wave, уничтожение всех
  врагов, 10-second upgrade intermission и следующая усиленная wave до поражения замка.
- Добавляются три server-authoritative типа угроз: дистанционный `gunship`, запускающий наводящиеся
  ракеты `missileCarrier` и разрушаемый контактный `asteroid`.
- Сервер начинает владеть seeded spawn director, enemy AI, HP, damage, collision, hostile
  projectiles, homing, rewards, wave difficulty, upgrade offers и defeat result; display только
  интерполирует и рисует authoritative snapshots.
- Gunner повреждает врагов и сбивает ракеты. Directional shield перехватывает угрозы только в своей
  текущей дуге, расходует дополнительную энергию от попадания и сохраняет существующий ручной rearm.
- После каждой wave pilot, gunner и shield независимо выбирают одно из трёх role-specific улучшений;
  при отсутствии выбора сервер применяет deterministic fallback.
- Массовые сущности получают стабильные identity и room projections с жёсткими caps; достижение cap
  откладывает spawn и не удаляет уже существующие сущности.
- **BREAKING** Protocol повышается с v7 до v8: encounter phase, combat snapshots, entity projections
  и idempotent `upgrade:choose` с typed `action_conflict`, `already_chosen` и `action_not_available`
  становятся частью strict wire contract; v7 clients отклоняются как `protocol_mismatch`.
- Без новых production dependencies. Phaser продолжает рисовать примитивы; Android native output,
  bitmap art и sound не меняются.
- Подтверждённые решения: свободная арена без vertical autoscroll; отдельное улучшение каждой роли;
  бесконечный run до defeat. Bosses, elites и manual run restart отложены в следующий change.

## Capabilities

### New Capabilities

- `authoritative-space-combat`: детерминированные enemies, asteroids, bullets, homing missiles,
  collisions, damage, entity lifecycle/caps и defeat.
- `role-roguelite-upgrades`: intermission, server-generated offers, отдельный выбор каждой роли,
  idempotency, fallback и сохранение upgrade state при reconnect/replacement.

### Modified Capabilities

- `wave-campaign`: вместо запрета waves вводятся бесконечные детерминированные combat waves и
  возрастающий budget.
- `flying-castle-simulation`: state получает seeded combat world, castle HP, damage и применённые
  role modifiers при сохранении fixed step 50 ms.
- `shared-room-session`: protocol v8, новые phases/projections, upgrade command, terminal defeat и
  reconnect semantics.
- `primitive-top-down-battlefield`: display рисует/interpolates enemies, asteroids, hostile bullets,
  missiles, impacts, castle HP, wave и intermission HUD, не рассчитывая trusted hits/deaths.
- `three-role-controls`: controllers показывают combat summary и собственные upgrade cards, а role
  inputs безопасно ведут себя во время intermission/defeat/reconnect.
- `connection-latency-diagnostics`: существующий server-measured RTT transport и UI переходят на
  strict protocol v8 без влияния на combat simulation.

## Impact

- `packages/protocol`: protocol v8 messages, phases, combat/upgrade projections и cross-field
  validation.
- `packages/game-core`: pure seeded spawn director, entity state, AI, homing, swept collision,
  damage, waves, upgrades и deterministic tests.
- `apps/server`: stable keyed Colyseus state, authoritative handlers, reconnect hydration,
  idempotency journal и entity/performance caps.
- `apps/display`: Phaser primitive renderers/interpolation и React combat/intermission/defeat HUD.
- `apps/controller`: role upgrade selection и compact combat state без координат массовых entities.
- `tests/e2e` и network smoke: combat, shield interception, upgrade/reconnect/protocol mismatch и
  worst-case room verification.
- Deployment topology и dependencies не меняются; увеличение CPU/network load проверяется room
  benchmark с целевым fixed-step p95 не более 2 ms на документированной reference machine.
