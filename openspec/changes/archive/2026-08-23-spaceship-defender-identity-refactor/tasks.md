## 1. Contract и rename inventory

- [x] 1.1 Зафиксировать brand/code/slug glossary, hard-cut protocol v10, room type, storage
      migration, gameplay equivalence и art/non-goal boundaries в proposal/specs/design; проверить
      strict OpenSpec validation и archive-apply dry-run.
- [x] 1.2 Добавить shared protocol constants/types/tests для `ROOM_TYPE`, v10,
      `PublicSpaceshipView`/`game.spaceship`, v9/unknown-field rejection и отсутствие `game.castle`.

## 2. Dead Tower Defense cleanup

- [x] 2.1 Удалить unused `packages/game-core/src/defense.ts`, его test/barrel export и доказать
      workspace import scan + game-core build/test.
- [x] 2.2 Удалить unused castle environment assets и obsolete sector/airstrike CSS; проверить asset,
      selector и bundle references.

## 3. Pure spaceship core

- [x] 3.1 Переименовать `flyingCastle.ts/.test.ts` в `spaceshipSimulation.ts/.test.ts`, публичные
      `SpaceshipSimulation*` types/functions и все `spaceship*` config/state/kinematics fields.
- [x] 3.2 Переименовать combat HP/target/collision helpers и entity references с castle на
      spaceship, сохранив RNG/order/caps/balance; обновить deterministic trace и collision tests.
- [x] 3.3 Обновить core barrel/API tests и 196-entity benchmark fixture; выполнить core
      test/typecheck/build и scoped lint/format.

## 4. Workspace и authoritative server

- [x] 4.1 Переименовать root/workspace manifests, imports, scripts и lockfile в
      `spaceship-defender`/`@spaceship-defender/*`; выполнить install-lock reconciliation и
      workspace typecheck resolution.
- [x] 4.2 Переименовать server files/classes в `SpaceshipDefenderRoom/State`, schema classes/fields
      в spaceship vocabulary и сохранить in-place reconciliation/StateView visibility.
- [x] 4.3 Зарегистрировать только shared `ROOM_TYPE=spaceship_defender`, обновить stats
      query/startup labels и room/protocol mismatch tests.
- [x] 4.4 Переименовать server room/performance tests и benchmarks; проверить rematch, reconnect,
      upgrade idempotency, TTL/stats и patch-size без semantic regressions.

## 5. Display и controllers

- [x] 5.1 Обновить display/controller adapters и fixtures на `game.spaceship`, strict v10 и новый
      package namespace без mass-entity leakage в controller projection.
- [x] 5.2 Переименовать `FlyingCastleCanvas/Runtime/Scene/ViewModel` files/symbols/test IDs/data
      attrs в `Spaceship*`, сохранить interpolation/hydration/camera/entity reconciliation tests.
- [x] 5.3 Обновить UI titles, headings, status/accessibility labels и CSS с brand
      `SpaceShip Defender` и spaceship vocabulary.
- [x] 5.4 Перевести reconnection storage на `spaceship-defender.controller-session.v1`, очищать
      legacy key до reconnect и проверить reload/grace/explicit-exit tests.

## 6. Scripts, docs и canonical specs

- [x] 6.1 Обновить network smoke, Playwright, responsive/test selectors и room creation на
      v10/shared room type; проверить movement/fire/shield/result/rematch/stats flow.
- [x] 6.2 Переписать README, AGENTS, OpenSpec config, project plan, GDD и repo-scoped agent/skill
      text: current behavior, product north star, 2D pseudo-3D deep-space direction и explicit
      non-goals.
- [x] 6.3 Reconcile change deltas/current docs в spaceship terminology, подготовить archive-applied
      замену `flying-castle-simulation` → `spaceship-simulation` и traceable retirement classic TD
      capabilities; в current canonical допускаются только восемь identical scenario heading-only
      renames, необходимые из-за ограничения OpenSpec 1.6, и formatting-only normalization без
      semantic changes; `openspec/changes/archive/**` не изменять.
- [x] 6.4 Выполнить filename/content scan и получить ноль legacy runtime identifiers вне immutable
      archives и migration artifacts; явно перечислить допустимые historical matches.

## 7. Verification и lifecycle

- [x] 7.1 Выполнить narrow package checks, затем `pnpm check`, `pnpm spec:validate`,
      `git diff --check`, network smoke, Playwright и combat benchmark/patch assertions.
- [x] 7.2 Провести read-only reviewer pass по contract compatibility, deterministic equivalence,
      visibility, reconnect/storage и rename completeness; исправить blocker/high/medium findings.
- [x] 7.3 Запустить local server/display/controller для ручной проверки нового brand, join/movement,
      fire/shield, result/rematch и stats; получить подтверждение пользователя.
- [x] 7.4 Только после подтверждения archive change, применить retirement deltas, удалить созданные
      OpenSpec 1.6 tombstone-only legacy directories, повторить validation/scan и подготовить
      отдельный commit/push по команде пользователя.
