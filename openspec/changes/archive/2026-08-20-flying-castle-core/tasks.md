## 1. OpenSpec и migration boundary

- [x] 1.1 Проверить strict validation и archive dry-run всех delta specs `flying-castle-core`;
      устранить конфликт старых canonical requirements.
- [x] 1.2 Пометить `support-2-to-6-defenders` как superseded новой концепцией без ложного закрытия
      невыполненных checklist items.
- [x] 1.3 Обновить `docs/PROJECT_PLAN.md` и OpenSpec project context: flying castle, три роли,
      primitive slice и следующие этапы.
- [x] 1.4 Исключить vendor skill assets из repository Prettier scan и проверить чистый formatting
      boundary.

## 2. Protocol v5

- [x] 2.1 Заменить defense domain protocol строгими v5 schemas для CrewRole, players, create/join
      options и server errors.
- [x] 2.2 Добавить strict ready/pilot/gunner/shield messages, normalized finite vectors, sequence
      envelopes и gunner firing state.
- [x] 2.3 Добавить отдельные DisplayRoomView/ControllerRoomView и cross-field validation
      world/system snapshots.
- [x] 2.4 Покрыть protocol tests: valid views/messages, extra fields, NaN/Infinity/range, v4
      mismatch shapes и отсутствие display-only fields у controller.
- [x] 2.5 Выполнить
      `pnpm --filter @town-defenders/protocol test && pnpm --filter @town-defenders/protocol typecheck`.

## 3. Детерминированный game-core

- [x] 3.1 Реализовать flying-castle config/state, vector normalization, received ticks и явное
      начальное состояние.
- [x] 3.2 Реализовать pilot movement, diagonal speed cap, radius-aware world clamp, neutral и
      timeout на пятом tick.
- [x] 3.3 Реализовать gunner/shield aim semantics, active shield, authoritative projectile
      fire/cooldown/movement/TTL.
- [x] 3.4 Добавить deterministic tests: identical traces, invalid config, bounds, zero aim,
      cooldown, projectile expiry и timeout boundary.
- [x] 3.5 Выполнить
      `pnpm --filter @town-defenders/game-core test && pnpm --filter @town-defenders/game-core typecheck`.

## 4. Authoritative Colyseus room

- [x] 4.1 Заменить defense schema flying-castle state, тремя role slots и display/controller
      StateView tags.
- [x] 4.2 Реализовать v5 create/join, canonical role assignment, exact-ready start, active
      replacement и room capacity transport spare.
- [x] 4.3 Реализовать strict input pipeline, per-connection sequences, immediate disconnect
      neutralization, reconnect watermark reset и 20 Hz timer.
- [x] 4.4 Реализовать simulation-tick gunner firing/cooldown и full/compact state synchronization
      без message-rate dependent projectile creation.
- [x] 4.5 Покрыть room tests: role order/ready/start, malformed/wrong-role/phase, stale sequence,
      firing rate, disconnect/reconnect/display expiry/replacement и StateView separation.
- [x] 4.6 Выполнить server unit/type checks и обновлённый real-network smoke с display + тремя
      controllers.

## 5. Controller roles

- [x] 5.1 Перевести controller room adapter/reconnect session на protocol v5 и stable CrewRole.
- [x] 5.2 Создать reusable VirtualStick с pointer/touch cancellation, unit vector и keyboard
      normalization helpers.
- [x] 5.3 Реализовать pilot panel: WASD/arrows, virtual stick, 50 ms latest-value coalescing, 100 ms
      heartbeat и neutral on blur/hidden.
- [x] 5.4 Реализовать gunner panel: aim stick/mouse/arrows и hold Fire/Space/LMB в sequenced input.
- [x] 5.5 Реализовать shield panel: aim stick/mouse/arrows и hold Protect/Space/LMB с safe inactive
      release.
- [x] 5.6 Покрыть controller tests для role rendering, vectors, keyboard, pointer release, heartbeat
      cleanup и outgoing messages.

## 6. Primitive Phaser display

- [x] 6.1 Перевести display adapter на strict DisplayRoomView v5 и удалить defense coercion.
- [x] 6.2 Реализовать lazy-loaded FlyingCastleRuntime: grid, non-colliding decor, castle, turret,
      shield arc и projectile circles.
- [x] 6.3 Реализовать bounded follow camera, snapshot interpolation/correction и projectile object
      reconciliation без trusted physics.
- [x] 6.4 Обновить React HUD/lobby для трёх roles, connection status и room link/QR без role labels
      внутри canvas.
- [x] 6.5 Добавить display model/component tests для primitive projection, camera bounds, runtime
      lifecycle и v5 lobby/active UI.

## 7. End-to-end и передача

- [x] 7.1 Обновить Playwright на display + три browser controller contexts: ready/start,
      WASD/virtual stick movement, gunner fire и shield activation.
- [x] 7.2 Выполнить package checks, `pnpm check`, `pnpm spec:validate`, network smoke и browser E2E;
      исправить все regression.
- [x] 7.3 Запустить server/display/controller, открыть display и три controller tabs для ручного
      playtest на одном компьютере.
- [x] 7.4 Провести read-only reviewer pass по authority, reconnect, idempotency, React/Phaser
      boundaries и OpenSpec acceptance.
- [x] 7.5 Закрыть checklist только по доказанным результатам; archive/commit выполнять после
      согласованного ручного теста пользователя.
