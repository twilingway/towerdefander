# SpaceShip Defender — план проекта

## 1. Product north star

SpaceShip Defender — кооперативный top-down space wave-defense для общего большого экрана и трёх
browser controllers. Команда управляет одним развиваемым космическим кораблём, уничтожает
нарастающие волны, зарабатывает credits и в целевой версии модернизирует корпус, щиты и оружие прямо
во время боя.

Роли:

- pilot перемещает корабль и уклоняется;
- gunner направляет и использует weapons;
- shield operator направляет и переключает энергетический сектор.

Server является единственным источником trusted state. Controllers отправляют intents, а display
интерполирует authoritative snapshots.

## 2. Архитектура

```text
Shared display                         Three browser controllers
React HUD + Phaser 2D world            Pilot / Gunner / Shield React UI
                \                      /
                 \ Colyseus WebSocket /
                  Authoritative server
                          |
             deterministic TypeScript core
```

- `apps/display` — большой экран, React HUD и Phaser world;
- `apps/controller` — responsive role controllers;
- `apps/server` — Colyseus room, validation, simulation, lifecycle и statistics;
- `packages/game-core` — pure fixed-step simulation без DOM/network/timers;
- `packages/protocol` — strict protocol v10 и shared schemas.

## 3. Реализованный foundation

- один spaceship, три стабильные role slots;
- мир 4800×3200 и fullscreen camera с безопасным cosmic overscan;
- 20 Hz fixed-step, мягкое движение и плавный traverse turret/shield;
- hold-fire, shield toggle, drain/recharge и authoritative RTT;
- gunships, missile carriers, asteroids, bullets и homing missiles;
- seeded spawn/RNG, swept collisions, HP, damage, score и defeat;
- 200-tick interval и role-specific upgrade cards;
- result, unanimous rematch, explicit exit/close, reconnect/replacement;
- room TTL и защищённая read-only statistics page;
- network smoke и display + 3 controllers Playwright.

Worst-case 196-entity benchmark на Ryzen 9 5900X/Node 22: pure-step p95 около 0,12 ms,
room-step+sync p95 около 0,27 ms при целевом бюджете 2 ms.

## 4. Завершённый identity foundation

Source tree очищен от двух прежних product names и использует единый contract:

- brand `SpaceShip Defender`;
- code vocabulary `Spaceship`/`spaceship`;
- npm scope `@spaceship-defender/*`;
- Colyseus room type `spaceship_defender`;
- protocol v10 и public `game.spaceship`;
- `SpaceshipDefenderRoom/State` и `SpaceshipSimulation*` API;
- удаление unused classic defense core/assets/spec catalog entries;
- обновление UI, tests, scripts, README, GDD, AGENTS и OpenSpec context.

Gameplay, balance, authority, reconnect и rematch при рефакторинге численно не изменились. Existing
rooms v9 не мигрируют: server/display/controllers обновляются одновременно. Полная история change
сохранена в `openspec/changes/archive/2026-08-23-spaceship-defender-identity-refactor/`.

## 5. Следующий gameplay change — credits и combat modernization

Нужно отдельно определить:

- authoritative credits source/rewards и caps;
- цены и upgrade catalog для hull/shield/weapons;
- idempotent purchase command с `actionId`;
- purchases во время combat без остановки simulation;
- персональная или командная ownership model;
- controller UI, feedback, duplicate/reconnect behavior;
- взаимодействие с текущими interval upgrade cards.

До принятия этих решений текущая версия честно остаётся на score + бесплатных interval upgrades.

## 6. Следующий visual change — deep-space art pass

Цель:

- original 2D pseudo-3D spaceship;
- layered stars/nebulae/dust и parallax;
- engine trails, projectile impacts, shield refraction и explosions;
- modern particles/shaders с fallback для Android TV;
- читаемость gameplay поверх красивого глубокого космоса.

Не входит: настоящий 3D, campaign/trading map, торговля, RPG и копирование assets/интерфейса
«Космических Рейнджеров». Референс означает только ощущение глубокого космоса.

## 7. Дальнейшие этапы

1. Завершить identity refactor, full checks, reviewer и ручной playtest.
2. Спроектировать credits + in-combat modernization.
3. Добавить новые enemy archetypes, elites и bosses вместе с balance pass.
4. Реализовать accepted 2D art/VFX/audio pipeline с Android TV budget.
5. Добавить thin Capacitor Android TV shell, launcher, fullscreen, wake lock и lifecycle.

## 8. Definition of done для каждого change

- proposal/specs/design/tasks согласованы;
- protocol versioned и boundary validation покрыта;
- resource-spending commands idempotent;
- deterministic core и reconnect scenarios протестированы;
- narrow checks, `pnpm check`, `pnpm spec:validate`, network smoke и Playwright зелёные;
- docs/environment examples обновлены;
- read-only reviewer не имеет blocker/high/medium findings;
- после ручного подтверждения change архивирован, а commit/push выполняются по команде пользователя.
