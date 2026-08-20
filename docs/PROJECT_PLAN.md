# Flying Castle — план проекта

Статус: 20 августа 2026 года основная концепция изменена с классического Tower Defense на
кооперативный top-down экшен про один летающий замок. Предыдущая реализация 2–6 дорог и protocol v4
сохранена в Git (`00c3ab7`) как точка возврата. Realtime slice и плавное управление зафиксированы
архивными changes `flying-castle-core` и `smooth-flight-controls`.

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
- `packages/protocol` — protocol v6 и строгие transport/view schemas.

## 3. Этапы

### Этап 1 — Primitive realtime slice (текущий)

- ровно три стабильные role slots: pilot, gunner, shield;
- мир 2400×1600, камера следует за замком;
- server-authoritative fixed step 50 ms;
- WASD/arrows и virtual stick для pilot;
- gesture-only aim + hold-fire для gunner, aim + toggle и энергия для shield;
- grid, замок, башня, щит, декор и снаряды из Phaser primitives;
- reconnect, active replacement, strict protocol v6 и network/browser tests.

Результат: руками проверяется совместное управление одним замком с трёх браузеров без финального
art.

### Этап 2 — Combat playground

- простые враги и server-authoritative collisions;
- здоровье замка, попадания пушек и блокирование щитом;
- spawn director без финальной campaign;
- feedback попаданий, debug HUD и настройка управления.

### Этап 3 — Карта и roguelike loop

- процедурные или секционные карты;
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
map, accounts, persistence, matchmaking, bitmap art, sound и Android native output. Эти решения
будут приниматься после ручной проверки core controls.
