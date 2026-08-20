# Flying Castle — план проекта

Статус: 20 августа 2026 года основная концепция изменена с классического Tower Defense на
кооперативный top-down экшен про один летающий замок. Предыдущая реализация 2–6 дорог и protocol v4
сохранена в Git (`00c3ab7`) как точка возврата. Realtime slice и плавное движение зафиксированы
архивными changes `flying-castle-core`, `smooth-flight-controls`, `smooth-tank-aim` и
`latency-fullscreen-world`.

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
- `packages/protocol` — protocol v7 и строгие transport/view schemas.

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

### Этап 2 — Combat playground

- простые враги и server-authoritative collisions;
- здоровье замка, попадания пушек и блокирование щитом;
- spawn director без финальной campaign;
- feedback попаданий, debug HUD и настройка управления.

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
