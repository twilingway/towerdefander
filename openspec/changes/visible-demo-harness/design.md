## Context

Существующие Playwright и network smoke запускаются без наблюдаемого окна и завершаются после
assertions. Display уже получает все mass entities, controller projections намеренно их не получают.
Для точного auto-aim harness нужен read-only target из display projection, но командный канал через
display или debug mutation нарушил бы authoritative boundary.

## Goals / Non-Goals

**Goals:**

- один явный запуск видимой демонстрации с автоматическим crew;
- наблюдаемые movement/fire/shield, intermission upgrade и rematch;
- Pause/Resume/Stop с безопасной neutralization и cleanup;
- reuse production protocol/server/core без balance override;
- подготовить повторяемый visual workflow для будущего enemy/NPC design.

**Non-Goals:**

- production feature flag или public demo endpoint;
- изменение protocol v11, core rules, damage/caps/waves;
- реализация NPC/PvP/multi-ship arena;
- управление demo через Android TV remote;
- автоматическая подмена visual acceptance пользователя.

## Decisions

### Видимый display работает в отдельном обычном Google Chrome

Root runner поднимает compiled server и Vite display на isolated strict ports. Controller-side demo
script запускает отдельный Google Chrome с временным owned profile и remote debugging port. После
старта Playwright подключается к нему через CDP только для read-only telemetry, local overlay bridge
и UI room creation; Playwright не владеет browser lifecycle/render scheduling. CDP принудительно
оставляет Page lifecycle active и focus-emulated. Controller roles подключаются через установленный
Colyseus SDK как отдельные обычные clients. Headless `demo:verify` по-прежнему использует
Playwright-owned Chrome.

Отклонено: запускать обычный E2E с `--headed` — он слишком быстро переключает страницы, закрывает
browser после assertions и не является управляемой демонстрацией.

### Display публикует только dev telemetry

Только при одновременных `import.meta.env.DEV`, runner-only `VITE_VISIBLE_DEMO=1` и `?demo=1`
`SpaceshipCanvas` вычисляет ближайший target из уже публичного display snapshot и добавляет
transient `data-demo-*` attributes. Harness читает их для intercept aim. Обычный URL не публикует
эти attributes. Telemetry не отправляет commands и не меняет state.

### Overlay общается с локальным Playwright bridge

React overlay загружается только при одновременном dev/env/query gate. Harness заранее регистрирует
Playwright exposed function для Pause/Resume/Stop; status доставляется обратно DOM CustomEvent с
validated локальным detail. При отсутствии bridge overlay показывает offline status и не влияет на
игру. Часто изменяющиеся automation values хранятся внутри overlay state, не добавляются в основной
room view.

### Auto-crew использует deterministic policy поверх authoritative state

Pilot описывает медленную траекторию внутри центра арены. Gunner читает ближайший display target,
вычисляет intercept direction и держит fire только в combat. Shield направляется к ближайшей угрозе
и использует hysteresis по authoritative energy. В intermission каждая роль один раз выбирает первую
published card с UUID actionId. В result harness ждёт видимую паузу и отправляет unanimous ready.

Pause сначала отключает scheduler и инвалидирует его generation, затем немедленно вызывает отдельную
neutral send. После neutral sequence ни один active intent не отправляется до Resume; authoritative
simulation, волны и damage продолжаются. Sequence watermarks продолжают монотонно расти. Stop
сначала neutralizes, затем Node runner, владеющий SDK controller connections, выполняет consented
leave; browser unload не считается надёжным transport cleanup. Неожиданный disconnect роли или
bridge переводит demo в failed и запускает cleanup без автоматической замены/reconnect. Root runner
закрывает browser и только свои child processes.

Harness читает один cached telemetry record не чаще 10 раз в секунду; 20 Hz role schedulers повторно
используют последнее значение, не выполняя Playwright DOM round-trip на каждом simulation step.

### Headed demo сохраняет реальную частоту рендера

Runner передаёт внешнему headed Chrome только presentation flags, отключающие native occlusion,
background-timer и renderer throttling, и активирует Page lifecycle через CDP. Эти flags не
используются production display и не меняют server simulation. Overlay считает
`requestAnimationFrame` frames и изменения authoritative snapshot tick по реальному elapsed time, а
runner считает отправленные batches обычных role intents. Показатели обновляются не чаще одного раза
в секунду и не вызывают React render на каждом frame.

Круглая arena рисуется Phaser Graphics напрямую: fill circle и аналитически ограниченные circle grid
segments. GeometryMask не используется, поскольку Phaser 4 WebGL предупреждает, что этот mask path
не поддерживается, и его fallback может ухудшать headed rendering. Entity interpolation и
authoritative positions при этом не меняются.

Ожидаемый healthy диапазон локальной демонстрации: render около 60 FPS, snapshots около 20 Hz и
controls около 20 Hz. Это диагностика, а не portable performance gate: фактический FPS зависит от
GPU, display refresh rate и foreground state.

### Конечный режим проверки

`pnpm demo:verify` запускает тот же harness headless с ограниченным timeout и SHALL доказать
observable movement, friendly projectile, active shield, intermission, три authoritative upgrade
selection и переход к wave 2. Бесконечный `demo:visible` остаётся только ручным инструментом и ждёт
Stop.

### Harness отделён от будущего NPC authority

Auto-crew — developer client, а не NPC implementation. Будущие NPC decisions должны жить на server
или в pure core input policy и управлять отдельными authoritative ship actors; browser SDK harness
нельзя переносить в production AI.

## Risks / Trade-offs

- **[Production balance может медленно завершать wave]** → target выбирается из display snapshot и
  gunner использует intercept aim; harness показывает status и не применяет damage cheats.
- **[GUI оставит процессы после закрытия]** → единый owner runner обрабатывает normal exit, error,
  SIGINT/SIGTERM и закрывает process tree.
- **[Overlay добавит production bundle code]** → маленький компонент загружается только по query, не
  содержит dependency и не подписывается без demo mode.
- **[Headed Chrome недоступен в CI/remote shell]** → команда является manual developer tool;
  standard checks остаются headless.

## Migration Plan

Добавить harness и документацию без migration production state. Rollback удаляет scripts, package
commands и dev-only overlay; protocol/server rooms остаются совместимыми.

## Open Questions

Нет для первого slice. Отдельный OpenSpec change определит multi-ship/NPC arena authority.
