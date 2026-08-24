## 1. Protocol v12

- [x] 1.1 Поднять `PROTOCOL_VERSION` до 12 в `packages/protocol/src/index.ts`.
- [x] 1.2 Расширить `pilotInputCommandSchema` обязательным полем `mgFiring: z.boolean()`.
- [x] 1.3 Добавить `heading` в `publicSpaceshipViewSchema`; создать `machineGunViewSchema`
      `{heat, capacity, overheated}` и добавить его в game snapshot schemas (controller/display).
- [x] 1.4 Добавить опциональное поле `source: z.enum(["cannon", "machineGun"])` в
      `publicProjectileViewSchema`.
- [x] 1.5 Обновить/добавить schema-тесты: v12 pilot input без `mgFiring` отклоняется, machineGun
      view валидируется, hostile projectile без `source` проходит.
- Проверка: `pnpm --filter @spaceship-defender/protocol test`.

## 2. Game-core: heading и носовой пулемёт

- [x] 2.1 Добавить config поля (heading rates `13π/15`, `26π/15`, `13π/5`; MG cooldown 2 ticks,
      damage 8, speed 900, radius 5, heat capacity 100, heat per shot 4, cooling 30/s, rearm 30) и
      их validation.
- [x] 2.2 Расширить state: `spaceshipHeading`, `headingTargetAngle`, `headingAngularVelocity`,
      `mgHeat`, `mgOverheated`, `queuedMgFire`, `lastMgFiredTick`; initial heading 0 в clean run.
- [x] 2.3 Расширить `applyPilotInput` полем `mgFiring`: rising edge → queued MG request (coalesce),
      ненулевой vector → heading target, нулевой — latched.
- [x] 2.4 В `advanceSpaceshipSimulation`: traverse heading по shortest arc/no overshoot; eligible
      fire tick → снаряд из носа по current heading; heat per shot / cooling на тиках без выстрела;
      overheat latch + rearm threshold; cap-подавление consumed request + перезапуск cooldown.
- [x] 2.5 Stale pilot input: movement zero, `mgFiring=false`, отмена heading target (current angle и
      heat сохраняются). Добавить trusted transition для disconnect/intermission neutralization MG
      (queued fire clear, mgFiring false, heading target null) и подключить его в core API.
- [x] 2.6 Детерминированные тесты: nose spawn offset, cooldown cadence (5 снарядов за 10 ticks),
      queued edge/short tap/coalesce, перегрев на 25-м снаряде, остывание до rearm за 47 ticks,
      auto-resume при удержании, stale/disconnect/intermission сценарии, heading traverse без
      overshoot и latched target.
- Проверка: `pnpm --filter @spaceship-defender/game-core test`.

## 3. Server room wiring

- [x] 3.1 `handlePilotInput` передаёт `mgFiring` в `applyPilotInput`; sequence watermark остаётся
      одним потоком на `pilot:input`.
- [x] 3.2 Подключить MG neutralization в disconnect path (`neutralizeRole`) и combat→intermission
      (`neutralizeAllRoles`).
- [x] 3.3 Projection: heading в spaceship view, machineGun view в controller/display snapshots,
      `source` у friendly projectiles (cannon/machineGun).
- [x] 3.4 Room-тесты: v12 pilot input применяется; v11 payload → `protocol_mismatch`; disconnect с
      pending MG fire очищает request/target; intermission neutralization; role/identity проверки не
      изменились.
- Проверка: `pnpm --filter @spaceship-defender/server test`.

## 4. Controller пилота

- [x] 4.1 Расширить `ControlState` полем `mgFiring`; `sendControl` для pilot шлёт `vector` +
      `mgFiring`.
- [x] 4.2 Правая hold-fire зона: pointerdown → `mgFiring=true`, pointerup/cancel/lost capture →
      false; pulse-first порядок для короткого тапа (по образцу gunner Fire).
- [x] 4.3 Space как desktop hold-спуск пилота (non-repeat keydown / keyup); blur/visibilitychange
      нейтрализуют movement и `mgFiring`.
- [x] 4.4 Шкала перегрева из authoritative machineGun view + overheat-состояние fire-зоны; local
      desired не меняется автоматически при перегреве.
- [x] 4.5 UI/unit тесты: hold/tap/Space сценарии, neutralization на blur/reconnect (mgFiring=false),
      overheat sync без локального моделирования heat.
- Проверка: `pnpm --filter @spaceship-defender/controller test`.

## 5. Display рендер

- [x] 5.1 View-model: mapping heading и machineGun view из snapshot; angle transition для heading.
- [x] 5.2 Phaser: носовой маркер/ствол MG на корпусе, вращаемый по interpolated heading (как
      turret).
- [x] 5.3 Снаряды MG отличимым цветом по `source` (fallback — существующий рендер по radius).
- [x] 5.4 Display тесты: heading transition shortest path, снаряды с/без `source`, data-атрибуты для
      E2E.
- Проверка: `pnpm --filter @spaceship-defender/display test`.

## 6. Docs и финальная верификация

- [x] 6.1 Обновить `docs/GAME_DESIGN_DOCUMENT.md`: роль пилота (нос + пулемёт с перегревом),
      protocol v12; при необходимости `docs/PROJECT_PLAN.md`.
- [x] 6.2 Прогнать `pnpm check` и исправить замечания lint/typecheck.
- [x] 6.3 Прогнать `pnpm spec:validate`; при наличии затронутых браузерных флоу — Playwright smoke
      из `tests/e2e`.
