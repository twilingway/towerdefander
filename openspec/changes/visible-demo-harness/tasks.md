## 1. Demo contract и observability

- [x] 1.1 Добавить pure demo-mode/nearest-target helpers и dev-only `data-demo-*` telemetry с unit
      tests, не меняя обычный display projection или protocol.
- [x] 1.2 Добавить React overlay status + Pause/Resume/Stop bridge, стили и component/helper tests;
      проверить отсутствие overlay на обычном URL.
- [x] 1.3 Добавить dev-only render FPS, authoritative snapshot Hz и auto-control Hz diagnostics с
      bounded React update cadence и pure rate tests.

## 2. Visible harness orchestration

- [x] 2.1 Добавить root runner, который сначала собирает server, затем запускает isolated strict
      ports, проверяет owned startup/stale-dist и выполняет cleanup; не использовать `tsx` watcher.
- [x] 2.2 Добавить controller-side headed Chrome + SDK auto-crew: ready, monotonic role inputs,
      target aim/fire, shield hysteresis, upgrades и result rematch.
- [x] 2.3 Реализовать immediate neutralization на Pause/Stop/error и consented controller cleanup;
      покрыть pure automation policy tests либо bounded verification assertions.
- [x] 2.4 Добавить `pnpm demo:visible` и документировать запуск/управление/future NPC boundary без
      включения GUI command в `pnpm check`.
- [x] 2.5 Добавить bounded `pnpm demo:verify` с timeout и assertions для movement/fire/shield,
      intermission, трёх upgrades и wave 2.
- [x] 2.6 Отключить headed Chrome occlusion/background throttling и заменить unsupported WebGL
      GeometryMask аналитически ограниченной circular grid; добавить geometry regression test.
- [ ] 2.7 Перевести headed mode на отдельный Google Chrome с temporary owned profile и CDP active
      lifecycle; сохранить Playwright-owned headless verify и покрыть launcher/cleanup checks.

## 3. Verification и показ

- [ ] 3.1 Выполнить display/controller tests, lint/typecheck/build, `pnpm check`,
      `pnpm spec:validate` и `git diff --check`.
- [ ] 3.2 Провести read-only reviewer pass и исправить blocker/high/medium findings.
- [ ] 3.3 Запустить external-Chrome demo, подтвердить foreground render >=30 FPS, показать
      пользователю движение/fire/shield и наблюдать переход как минимум wave 1→2; оставить change
      активным до пользовательского подтверждения.
