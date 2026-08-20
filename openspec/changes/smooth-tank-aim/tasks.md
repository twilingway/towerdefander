## 1. OpenSpec contract

- [x] 1.1 Проверить proposal/design/delta specs на absolute-bearing semantics, protocol v6
      compatibility, current-angle firing, stale/disconnect/reconnect и archive-safe сохранение
      canonical scenarios; выполнить `pnpm spec:validate`.

## 2. Deterministic angular core

- [x] 2.1 Добавить validated turret/shield max angular speed, acceleration и braking в
      `FlyingCastleConfig`, а target angle/angular velocity — во внутренний `FlyingCastleState`.
- [x] 2.2 Реализовать pure canonical-angle, deterministic shortest-delta (`π` выбирает positive),
      scalar velocity move и target-aware no-overshoot angular traverse helpers.
- [x] 2.3 Подключить turret/shield traverse к fixed step: nonzero aim обновляет target, zero
      сохраняет, inactive shield вращается, projectile использует current turret angle.
- [x] 2.4 Реализовать stale и trusted disconnect cancellation с мягким angular braking и без
      восстановления target после reconnect.
- [x] 2.5 Добавить deterministic tests для config, first-step no-snap, rates, 180° traverse,
      acceleration/braking, wrap/antipode, no overshoot, tap, stale/disconnect, inactive shield и
      current-angle projectile; выполнить game-core test/typecheck/build/lint.

## 3. Authoritative room

- [x] 3.1 Подключить gunner/shield target cancellation к disconnect path, сохранив существующие
      fire/shield/energy transitions и protocol v6 schemas без изменений.
- [x] 3.2 Добавить room tests для no-snap snapshot, current-angle fire, shield pre-aim,
      stale/disconnect braking, reconnect sequence 1 без старой target и duplicate/out-of-order
      retarget protection; выполнить server tests/typecheck.

## 4. Controller и display

- [x] 4.1 Сохранить gesture-only absolute-bearing VirtualStick/keyboard mapping и проверить
      controller/E2E regressions: tap отправляет bearing до neutral, ordinary mouse не retarget,
      React не вычисляет trusted easing.
- [x] 4.2 Проверить Phaser shortest-arc interpolation для постепенно меняющихся authoritative
      angles, добавить wrap/antipode и angular 60/120 Hz tolerance 0.001 tests, сохранив hydration
      snap.
- [x] 4.3 Выполнить controller/display tests, typecheck и scoped lint.

## 5. Integration и передача

- [x] 5.1 Обновить network smoke, Playwright и `docs/PROJECT_PLAN.md` для плавного tank traverse без
      protocol bump; совместно с core/display tests покрыть tap, current-angle fire, inactive shield
      pre-aim, wrap и reconnect.
- [x] 5.2 Выполнить `pnpm check`, `pnpm spec:validate` и `git diff --check`; исправить regressions.
- [x] 5.3 Провести read-only reviewer pass по authority, angular math, stale/reconnect, pointer
      lifecycle, render interpolation и archiveability.
- [ ] 5.4 Запустить server/display/controller и открыть ручной playtest.
- [ ] 5.5 При необходимости скорректировать только config rates по результату playtest и повторить
      relevant tests/checks.
- [ ] 5.6 После явного подтверждения пользователя архивировать change и выполнить отдельные commit и
      push.
