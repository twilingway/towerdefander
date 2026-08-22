# Flying Castle — план проекта

Статус: 20 августа 2026 года основная концепция изменена с классического Tower Defense на
кооперативный top-down экшен про один летающий замок. Предыдущая реализация 2–6 дорог и protocol v4
сохранена в Git (`00c3ab7`) как точка возврата. Realtime slice и плавное движение зафиксированы
архивными changes `flying-castle-core`, `smooth-flight-controls`, `smooth-tank-aim` и
`latency-fullscreen-world`. Active change `tyrian-combat-roguelite-slice` переводит прототип на
protocol v8 и добавляет первый server-authoritative combat/upgrade loop.

## 1. Цель продукта

Один общий экран запускается в desktop browser, на проекторе или позже внутри Android TV shell. Три
игрока подключаются из браузеров телефонов/планшетов/компьютеров через LAN/Wi-Fi или интернет:

- pilot двигает замок по большой top-down карте;
- gunner направляет башню и стреляет;
- shield operator направляет, вручную переключает защитный сектор и следит за его энергией.

Сервер является единственным источником истины. Display показывает Phaser-мир и интерполирует server
snapshots. Controllers отправляют только intents и не рассчитывают trusted transforms.

## 2. Архитектура

```text
Shared display                         Three browser controllers
React HUD + Phaser world               Pilot / Gunner / Shield React UI
                \                      /
                 \ Colyseus WebSocket /
                  Authoritative server
                          |
             deterministic TypeScript core
```

Monorepo остаётся на pnpm workspaces:

- `apps/display` — общий экран, React HUD и lazy-loaded Phaser;
- `apps/controller` — responsive role controllers;
- `apps/server` — Colyseus room, reconnect, validation и simulation timer;
- `packages/game-core` — pure fixed-step simulation без DOM/network/timers;
- `packages/protocol` — protocol v8 и строгие transport/view schemas.

## 3. Этапы

### Этап 1 — Primitive realtime slice (текущий)

- ровно три стабильные role slots: pilot, gunner, shield;
- мир 4800×3200, fullscreen camera показывает минимум 1600×900 logical units и адаптируется к aspect
  ratio экрана;
- camera использует ограниченный космический overscan за рамкой мира: у любой границы весь замок,
  пушка и щит остаются минимум в 160 CSS pixels от края экрана;
- server-authoritative fixed step 50 ms;
- WASD/arrows и virtual stick для pilot;
- gesture-only absolute aim с server-authoritative разгоном, торможением и ограничением скорости
  поворота для gunner/shield;
- повторный tuning после playtest: turret `78/156/234°/s`, shield `97.5/195/292.5°/s` для
  max-speed/acceleration/braking;
- hold-fire для gunner, toggle и энергия для shield;
- grid, замок, башня, постоянно видимый directional shield, декор и снаряды из Phaser primitives;
- server измеряет RTT каждого WebSocket connection; общий экран показывает пинг display и всех трёх
  ролей, controller — собственный пинг. Это не прямой client-to-client RTT и не измерение полного
  input-to-render отклика;
- reconnect, active replacement, strict protocol v7 и network/browser tests.

Результат: руками проверяется совместное управление одним замком с трёх браузеров без финального
art.

### Этап 2 — Combat playground (в разработке)

- утверждённый change name: `tyrian-combat-roguelite-slice`;
- свободное движение по текущей большой top-down арене без принудительного вертикального
  автоскролла;
- бесконечный забег до уничтожения замка: волна → уничтожение всех врагов → 10 секунд выбора
  улучшений → следующая усиленная волна;
- `gunship` держит дистанцию и стреляет одиночными линейными снарядами;
- `missileCarrier` запускает наводящиеся ракеты с ограниченной скоростью поворота и lifetime;
- разрушаемый `asteroid` движется по постоянной траектории и наносит контактный урон;
- server-authoritative HP, damage, swept collisions, spawn director, enemy AI, homing missiles,
  rewards, wave difficulty, upgrade offers и defeat;
- gunner повреждает врагов и сбивает ракеты, directional shield перехватывает пули, ракеты и
  астероиды и расходует дополнительную энергию от попаданий;
- каждый из трёх игроков выбирает одно собственное role-specific улучшение после каждой волны;
- первая версия остаётся на Phaser primitives; bosses, elites, bitmap art и звук отложены.

Решения выше подтверждены пользователем 20 августа 2026 года. Vertical autoscroll, общий голос за
одно улучшение и обязательный boss в первом combat slice отклонены. Боссы будут отдельным следующим
этапом после проверки базового боя и баланса.

Текущий реализованный foundation:

- pure deterministic seeded simulation и protocol v8;
- gunship, missile carrier, asteroids, friendly/hostile bullets и limited-turn homing missiles;
- swept collisions, directional shield interception, castle HP/damage/score/defeat;
- stable keyed Colyseus entities вместо полного пересоздания collection каждый tick;
- 200-tick intermission, три role-owned cards, manual/fallback selection и bounded idempotency
  journal;
- Phaser primitive rendering, combat HUD и персональные controller cards;
- package tests, network smoke и базовый display+3 controllers Playwright проходят.

До завершения change остаются worst-case benchmark/patch-size assertions, расширенный combat E2E,
review findings, ручной playtest и balance tuning.

### Этап 3 — Карта и roguelike loop

- процедурные или секционные карты;
- отдельное решение по Tyrian-inspired vertical scrolling/dead-zone камеры и направлению полёта;
- encounters, ресурсы, upgrades и выбор маршрута;
- победа/поражение и короткая replayable session;
- типы врагов, elite и boss encounters.

### Этап 4 — Art, sound и Android TV

- утверждённое художественное направление вместо primitives;
- animation, VFX, audio и onboarding каждой роли;
- performance budget для слабого Android TV;
- Capacitor shell, launcher, fullscreen, wake lock и lifecycle.

## 4. Правила разработки

- Любое существенное изменение проходит proposal → specs → design → tasks → implementation → review
  → archive.
- Protocol/server/game-core меняются через `openspec-workflow` и `realtime-game-contract`.
- Phaser рисует world; React владеет lobby и HUD.
- Новая production dependency требует принятого design и согласования.
- Перед завершением обязательны package tests, `pnpm check`, `pnpm spec:validate`, network smoke и
  Playwright.

## 5. Не входит в первый slice

Enemies, damage, collision с декором, shield upgrades, waves, economy, victory/defeat, procedural
map, accounts, persistence, matchmaking, bitmap art, sound, runtime admin panel и Android native
output. Для admin panel отдельно потребуются owner authorization, допустимые диапазоны и правила
синхронизации параметров комнаты; эти решения будут приниматься после ручной проверки core controls.

## 6. Active change — `tyrian-combat-roguelite-slice`

OpenSpec proposal/specs/design/tasks завершены и проходят strict validation; production vertical
slice реализован по отмеченным checkbox. Следующие действия выполняются по оставшимся незакрытым
задачам change.

Порядок работы:

1. Создать proposal с утверждённым профилем, явными goals/non-goals и переходом protocol v7 → v8.
2. Описать capabilities `authoritative-space-combat` и `role-roguelite-upgrades`; обновить
   `wave-campaign`, `flying-castle-simulation`, `shared-room-session`,
   `primitive-top-down-battlefield` и `three-role-controls`.
3. В design закрепить deterministic seeded fixed-step 50 ms, стабильный порядок collision по entity
   ID, swept segment-circle collisions, server authority, reconnect и idempotent `upgrade:choose` с
   `actionId`.
4. До добавления массовых сущностей заменить полное пересоздание projectile collection каждый tick
   на stable keyed Colyseus state с обновлением сущностей на месте.
5. Зафиксировать лимиты комнаты: 40 enemy ships, 16 asteroids, 96 hostile bullets, 12 homing
   missiles, 32 friendly projectiles и не более 196 динамических сущностей суммарно. При достижении
   лимита откладывать spawn, не удаляя существующие сущности.
6. Разбить реализацию: protocol v8 → deterministic game-core → server room/projections → Phaser
   rendering/HUD → controller upgrade cards → network/E2E/performance verification.
7. Обязательные проверки: одинаковый seed и inputs дают одинаковый результат; projectile не
   туннелирует; shield блокирует только своей дугой; missile соблюдает turn-rate; collision order и
   caps стабильны; duplicate/stale upgrade не применяется дважды; reconnect работает в combat,
   upgrade и defeated.
8. Для worst-case комнаты добавить benchmark с целевым fixed-step p95 не более 2 ms на явно
   указанной reference-машине и проверить отсутствие полного resend неизменившихся сущностей.
9. После реализации запустить package tests, `pnpm check`, `pnpm spec:validate`, network smoke и
   Playwright; затем reviewer, ручной playtest, archive, commit и push.
