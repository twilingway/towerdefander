## 1. Protocol v8

- [x] 1.1 Добавить protocol-v8 encounter, castle HP, role modifiers, offers/selections, entity kinds
      и strict combat schemas с unique-ID/cap/phase cross-field validation; проверить protocol
      tests, typecheck и build.
- [x] 1.2 Добавить strict `upgrade:choose`, typed `action_conflict`/`already_chosen`/
      `action_not_available`, v7 mismatch и display/controller projection separation tests;
      выполнить scoped ESLint/Prettier.

## 2. Deterministic combat foundation

- [x] 2.1 Расширить flying-castle config/state explicit uint32 seed, RNG state, HP, encounter/wave,
      score, spawn sequence, modifiers и validated caps без DOM/timers/Math.random; покрыть
      одинаковый seed/input trace и invalid-config tests.
- [x] 2.2 Реализовать deterministic wave budget/plan, unlock carrier с wave 3, pending spawn и
      intermission/next-wave/defeat transitions; проверить monotonic difficulty и caps для
      нескольких seeds/waves.
- [x] 2.3 Реализовать role upgrade offers, atomic modifiers, 200-tick deadline/fallback, neutral
      transition и shield recharge; покрыть раннее завершение и все role modifier effects.

## 3. Enemies, projectiles и collisions

- [x] 3.1 Реализовать gunship distance steering/linear fire, missile-carrier steering/fire и
      constant-velocity asteroids в stable spawn order; покрыть cooldown/lifetime/bounds tests.
- [x] 3.2 Реализовать limited-turn homing missiles с shortest-arc/no-snap и current castle target;
      покрыть turn-rate, wrap, lifetime и cap tests.
- [x] 3.3 Реализовать spatial broad phase и deterministic swept segment-circle collisions для
      friendly projectile→enemy/asteroid/missile; покрыть tunneling, first ordered hit и hostile
      bullet non-interception.
- [x] 3.4 Реализовать shield-arc-first и castle damage pipeline для bullet/missile/asteroid,
      hit-energy/auto-OFF/rearm и defeated freeze; покрыть front/back arc, low-energy
      collapse/pass-through, simultaneous order и HP clamp.
- [x] 3.5 Выполнить полный `@town-defenders/game-core` test/typecheck/build, scoped lint/format и
      добавить worst-case pure-step benchmark harness с описанием reference machine.

## 4. Authoritative room и sync

- [x] 4.1 Перевести friendly projectiles и новые mass entities на stable keyed Colyseus `MapSchema`
      с in-place updates/removal и display-only StateView ownership; проверить отсутствие
      clear/recreate на unchanged tick.
- [x] 4.2 Запускать core с explicit room seed, синхронизировать encounter/HP/entities/modifiers и
      personalized controller offers; добавить room invariant/adapters tests для
      combat/intermission/ defeated и entity caps.
- [x] 4.3 Реализовать `upgrade:choose` authorization и bounded 32-entry per-identity journal с exact
      duplicate outcome, collision, stale offer, reconnect и replacement tests.
- [x] 4.4 Обновить gameplay phase authorization, trusted neutralization на intermission,
      disconnect/reconnect/fallback/defeated lifecycle и protocol-v7 rejection; выполнить server
      tests, typecheck и scoped lint.
- [x] 4.5 Добавить network assertions для keyed patches: unchanged entities не пересылаются целиком,
      20-Hz controls и latency pong остаются допустимыми при combat traffic.

## 5. Shared display

- [x] 5.1 Расширить display adapter/view model encounter/HP и stable combat entities, сохраняя
      same-tick telemetry guard и hydration; покрыть strict view и lifecycle tests.
- [x] 5.2 Добавить Phaser primitive lifecycle/interpolation для gunship, carrier, asteroid, bullets
      и missiles по entity ID; проверить create/update/remove, heading wrap и отсутствие local
      homing/hit.
- [x] 5.3 Добавить React HUD wave/score/HP/countdown/defeat и intermission overlay без уменьшения
      fullscreen battlefield; выполнить display tests/typecheck/lint.

## 6. Controllers

- [x] 6.1 Расширить controller adapter compact encounter/HP/modifiers и personalized offer без mass
      entities; покрыть projection/role privacy tests.
- [x] 6.2 Добавить accessible role-specific upgrade cards, pending exact command/reconnect
      hydration, authoritative selected state и deterministic fallback UI; покрыть
      click/duplicate/replacement.
- [x] 6.3 Отключать realtime controls/scheduler в intermission/defeated и начинать следующую wave с
      neutral local state; выполнить controller component tests/typecheck/lint.

## 7. End-to-end и завершение change

- [x] 7.1 Закрепить combined network acceptance: network smoke проверяет stable spawn, gunner hit,
      directional shield block, castle damage, upgrade duplicate и combat/intermission reconnect;
      seeded core покрывает missile turn/current target, server — defeated reconnect, Playwright —
      authoritative defeat. Выполнить стабильный повторный smoke.
- [x] 7.2 Обновить Playwright flow display+3 controllers: пройти wave, выбрать три upgrades, начать
      следующую wave и наблюдать defeat; проверить desktop/mobile controls и fullscreen HUD.
- [x] 7.3 Запустить worst-case room benchmark при 196 entities, записать CPU/reference machine,
      fixed-step p95 и patch sizes; при p95>2 ms оптимизировать broad phase/sync и повторить.
- [x] 7.4 Обновить `docs/PROJECT_PLAN.md`, protocol/config comments и environment examples
      фактическим v8 combat behavior и tuning; не добавлять secrets/endpoints.
- [x] 7.5 Выполнить package checks, `pnpm check`, `pnpm spec:validate`, `git diff --check` и
      безопасный OpenSpec `applySpecs(..., {dryRun:true})` archive-apply check; устранить все
      failures.
- [x] 7.6 Выполнить read-only reviewer pass по contract/spec/task truth и закрыть
      blocker/high/medium findings.
- [x] 7.7 Запустить локальные server/display/controllers для ручного playtest и получить
      подтверждение пользователя по balance/UX.
- [x] 7.8 После подтверждения сверить все checkbox/artifacts и объявить change ready-to-archive;
      archive, commit, push и restart выполнять отдельными lifecycle действиями только после всех
      отмеченных checkbox.
