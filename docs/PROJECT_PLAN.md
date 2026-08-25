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
- `apps/admin` — консоль баланса: волны, каталог врагов, директор и кадр камеры;
- `packages/game-core` — pure fixed-step simulation без DOM/network/timers;
- `packages/protocol` — strict protocol v17 и shared schemas.

## 3. Реализованный foundation

- один spaceship, три стабильные role slots;
- круглая authoritative арена `4400×4400`, радиус `2200`, и fullscreen camera с cosmic overscan;
- 20 Hz fixed-step, мягкое движение и плавный traverse turret/shield;
- hold-fire, shield toggle, drain/recharge и authoritative RTT;
- каталог из пяти архетипов — перехватчик, ганшип, снайпер, ракетоносец и босс — с собственными
  силуэтами, орудиями и дальностями открытия огня;
- явная таблица волн поверх процедурного директора и постоянный seeded-поток астероидов, входящих с
  разных сторон арены;
- файл пресетов баланса и защищённый `/admin/balance`, из которого консоль правит кампанию, врагов и
  кадр камеры без пересборки сервера;
- seeded spawn/RNG, swept collisions, HP, damage, score и defeat;
- общий credits balance и 600-tick командное голосование за один paid role upgrade;
- result, unanimous rematch, explicit exit/close, reconnect/replacement;
- 20-минутный deadline каждой combat wave, timeout defeat, room TTL и защищённая read-only
  statistics page;
- network smoke и display + 3 controllers Playwright.

Worst-case 196-entity benchmark на Ryzen 9 5900X/Node 22: pure-step p95 около 0,12 ms,
room-step+sync p95 около 0,27 ms при целевом бюджете 2 ms.

## 4. Завершённый identity foundation

Source tree очищен от двух прежних product names и использует единый contract:

- brand `SpaceShip Defender`;
- code vocabulary `Spaceship`/`spaceship`;
- npm scope `@spaceship-defender/*`;
- Colyseus room type `spaceship_defender`;
- public `game.spaceship` и hard-cut versioned protocol, развившийся до текущего v17;
- `SpaceshipDefenderRoom/State` и `SpaceshipSimulation*` API;
- удаление unused classic defense core/assets/spec catalog entries;
- обновление UI, tests, scripts, README, GDD, AGENTS и OpenSpec context.

Gameplay, balance, authority, reconnect и rematch при рефакторинге численно не изменились. Existing
rooms v9 не мигрируют: server/display/controllers обновляются одновременно. Полная история change
сохранена в `openspec/changes/archive/2026-08-23-spaceship-defender-identity-refactor/`.

## 5. Завершённый arena foundation

- server-authoritative круглая геометрия вместо прямоугольного gameplay bounds;
- spaceship и enemy ships целиком остаются внутри окружности, сохраняя касательное движение;
- projectiles, missiles и asteroids очищаются по внешней circular envelope;
- seeded ambient asteroids появляются каждые 2–5 секунд во время combat, входят с разных сторон и
  пересекают арену по случайным воспроизводимым траекториям;
- display рисует круговую границу и маскирует игровую сетку, оставляя снаружи глубокий космос.

## 6. Gameplay foundation — credits и team upgrades

- score остаётся нетратимым результатом run, credits принадлежат всему экипажу;
- награда за цель живёт в каталоге архетипов: wave asteroid и перехватчик `1`, ганшип `2`, снайпер
  `3`, ракетоносец `4`, босс `30` credits, а ambient targets и missiles не позволяют фармить валюту;
- projectile kill и shield interception ракеты/астероида дают одинаковый однократный score reward;
- между waves экипаж 30 секунд голосует за одну из cards pilot/gunner/shield стоимостью 5 credits;
- protocol v17, revision и action journal защищают vote/reconnect/duplicate delivery;
- balance, votes и итоговый modifier являются server-authoritative.

Покупки непосредственно во время combat, tier prices и persistent economy остаются отдельным будущим
change после balance pass.

## 7. Следующий visual change — deep-space art pass

Цель:

- original 2D pseudo-3D spaceship;
- layered stars/nebulae/dust и parallax;
- engine trails, projectile impacts, shield refraction и explosions;
- modern particles/shaders с fallback для Android TV;
- читаемость gameplay поверх красивого глубокого космоса.

Не входит: настоящий 3D, campaign/trading map, торговля, RPG и копирование assets/интерфейса
«Космических Рейнджеров». Референс означает только ощущение глубокого космоса.

## 8. Дальнейшие этапы

1. Провести balance pass credits/rewards в консоли и спроектировать отдельную in-combat
   modernization.
2. Добавить архетипы `charger`/`support`, elites и многофазных боссов вместе с balance pass.
3. Реализовать accepted 2D art/VFX/audio pipeline с Android TV budget.
4. Добавить thin Capacitor Android TV shell, launcher, fullscreen, wake lock и lifecycle.

## 9. Видимый demo/test harness

Отдельная команда `pnpm demo:visible` показывает общий экран в headed Chrome и управляет тремя
обычными controller connections. Harness не меняет protocol, balance или trusted state и служит для
совместного визуального тестирования movement/fire/shield, смены волн и будущего проектирования NPC.
`pnpm demo:verify` конечным сценарием проверяет бой, team-upgrade vote и переход к wave 2.

## 10. Definition of done для каждого change

- proposal/specs/design/tasks согласованы;
- protocol versioned и boundary validation покрыта;
- resource-spending commands idempotent;
- deterministic core и reconnect scenarios протестированы;
- narrow checks, `pnpm check`, `pnpm spec:validate`, network smoke и Playwright зелёные;
- docs/environment examples обновлены;
- read-only reviewer не имеет blocker/high/medium findings;
- после ручного подтверждения change архивирован, а commit/push выполняются по команде пользователя.
