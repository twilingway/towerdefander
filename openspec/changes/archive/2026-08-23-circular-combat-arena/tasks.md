## 1. Pure arena geometry и spaceship movement

- [x] 1.1 Добавить в `game-core` validated `arenaRadius`, square `4400×4400` defaults и pure helpers
      circle containment/projection/outward-normal removal; проверить unit tests и invalid configs.
- [x] 1.2 Перевести initial spaceship и pilot boundary на circle, сохранив acceleration/braking и
      tangent/inward velocity; покрыть cardinal/diagonal rim, center и multi-tick recovery tests.
- [x] 1.3 Перевести friendly projectile cleanup на circular envelope без изменения cooldown/damage и
      проверить edge/lifetime traces.

## 2. Enemy spawn, movement и cleanup

- [x] 2.1 Перевести seeded enemy/wave-asteroid spawn с rectangular edges на deterministic circle
      angles; проверить одинаковые seed traces и full-circle entry/exit distribution.
- [x] 2.2 Ограничить gunship/missileCarrier circle с учётом entity radius, сохраняя tangent/inward
      AI motion, и исключить enemy ships из boundary deletion; добавить regression преследования у
      края.
- [x] 2.3 Добавить independent ambient asteroid RNG/scheduler 40–100 combat ticks, internal origin,
      wave-first same-tick ordering, cap backpressure, fresh per-wave delay и defeat precedence;
      покрыть multi-wave/RNG/cap tests.
- [x] 2.4 Перевести asteroid/hostile bullet/homing missile cleanup на circular padded envelope при
      ordering collision-before-cleanup; покрыть boundary hit и asteroid traversal tests.
- [x] 2.5 Повторить core tests/typecheck/build/lint и worst-case 196-entity benchmark, зафиксировать
      отсутствие cap/determinism/performance regression.

## 3. Protocol v11

- [x] 3.1 Поднять `PROTOCOL_VERSION` до 11, добавить strict `arenaRadius` в controller/display game
      schemas и cross-field `worldWidth===worldHeight===2*radius` validation.
- [x] 3.2 Валидировать spaceship/enemy full-circle containment и padded-circle transient entities с
      epsilon только для floating-point noise; покрыть malformed/outside/edge snapshots.
- [x] 3.3 Обновить strict create/join/ready/input/upgrade/latency fixtures на v11 и доказать, что
      v10 mismatch отклоняется; выполнить protocol tests/typecheck/build/lint.

## 4. Authoritative room projection

- [x] 4.1 Добавить `arenaRadius` в `SpaceshipDefenderGameState` и sync только из validated core
      config; обновить defaults на `4400×4400` и привести decorative obstacles внутрь circle.
- [x] 4.2 Обновить display/controller StateView adapter contracts: обе projections получают
      geometry, controller по-прежнему не получает mass entities; проверить reconnect/hydration.
- [x] 4.3 Параметризовать create/join/gameplay mismatch tests для v10→v11 и доказать отсутствие
      roster, watermark, journal и world mutation; выполнить server tests/typecheck/build/lint.

## 5. Controller compatibility

- [x] 5.1 Перевести controller messages/fixtures на v11, сменить reconnect storage key `.v1→.v2` и
      удалять оба legacy records до reconnect без изменения scheduler/intents/gameplay semantics.
- [x] 5.2 Обновить compact room adapter для `arenaRadius`, не добавляя entity collections или
      client-side bounds; выполнить controller tests/typecheck/build/lint.

## 6. Circular display

- [x] 6.1 Обновить display adapter/fixtures на v11 geometry и strict circular snapshots.
- [x] 6.2 Заменить rectangular grid/border на static circular mask/grid/stroke и затемнённый outside
      space без per-frame mask recreation или trusted client constraints.
- [x] 6.3 Обновить camera/view-model tests для center/cardinal/diagonal rim и aspect ratios
      `1920×1080`, `1366×768`, `1024×768`; проверить отсутствие stretch/jitter.
- [x] 6.4 Выполнить display tests/typecheck/build/lint и проверить hydration/rematch с circle
      visuals.

## 7. End-to-end verification и lifecycle

- [x] 7.1 Обновить network smoke: v11 room, arenaRadius, continuous published enemy containment и
      multi-side asteroid stream; совместно с long-running pursued core/server regression проверить
      reconnect и отсутствие protocol/cap regression.
- [x] 7.2 Обновить Playwright display+3 controllers: authoritative circle geometry опубликована,
      pilot остаётся внутри arena, fire/shield/rematch работают; enemy non-exit дополнительно
      доказан strict snapshot, network smoke и long-running core/server traces.
- [x] 7.3 Обновить README/GDD/PROJECT_PLAN и benchmark doc: arena `4400×4400/radius 2200`, protocol
      v11, circular authority и outside-space semantics.
- [x] 7.4 Выполнить `pnpm check`, `pnpm spec:validate`, `git diff --check`, benchmark и non-mutating
      `pnpm spec show circular-combat-arena --json --deltas-only`; провести reviewer pass и
      исправить blocker/high/medium.
- [x] 7.5 Запустить local server/display/controller для ручного playtest и получить подтверждение
      пользователя; только затем archive/commit/push отдельной командой.
