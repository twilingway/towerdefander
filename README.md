# Town Defenders

Кооперативная Tower Defense игра для 2–6 игроков. Общее поле запускается в браузере компьютера на
большом экране или в Android TV shell. Игроки используют браузеры телефонов, планшетов или других
компьютеров как контроллеры.

## Текущий статус

Готовы:

- pnpm monorepo;
- OpenSpec workflow и спецификации игрового цикла;
- Codex project rules, read-only agents и repo-scoped skills;
- display/controller/server приложения;
- общий типизированный protocol package;
- чистая детерминированная симуляция двух секторов, пяти волн, трёх обычных типов врагов и босса;
- авторитетная Colyseus-комната protocol v3 с общей казной, `repair`/`upgrade`, авиаударом,
  дедупликацией и reconnect;
- display создаёт комнату, показывает QR и визуализирует бой в responsive Phaser-сцене с рисованным
  центральным замком, двумя дорогами и боковыми пушечными башнями;
- controller входит по ссылке/коду, управляет ready, ремонтом, улучшением и направляет общий
  авиаудар в свой или соседний сектор;
- format, lint, typecheck, unit tests и production builds;
- server health endpoint, сетевой smoke и Playwright-тест полного пяти-волнового матча.

Следующий художественный этап — отдельные sprite-анимации врагов, визуальные уровни башен и звук.
Расширение с 2 до 3–6 игроков будет отдельным изменением.

## Требования

- Node.js 22 или новее;
- pnpm 10.34.5 через Corepack.

## Запуск

```powershell
corepack enable pnpm
pnpm install
Copy-Item .env.example .env.local
pnpm dev
```

Локальные адреса по умолчанию:

- display: `http://localhost:5173`;
- controller: `http://localhost:5174`;
- server: `http://localhost:2567`;
- health: `http://localhost:2567/health`.

Vite слушает `0.0.0.0`, поэтому страницы можно открыть с другого устройства в той же сети, заменив
`localhost` на LAN-адрес компьютера. Windows Firewall может запросить разрешение для Node.js.

Для телефона замените `localhost` в `.env.local` на LAN-адрес компьютера, например:

```dotenv
VITE_GAME_SERVER_URL=ws://192.168.1.20:2567
VITE_CONTROLLER_URL=http://192.168.1.20:5174
HOST=0.0.0.0
PORT=2567
```

Display можно открыть на большом экране компьютера по `http://localhost:5173` или на Android TV в
браузере по `http://192.168.1.20:5173`. Контроллеры открывают адрес из QR-кода.

## Подключение через интернет

Архитектура поддерживает удалённых игроков: display и controllers подключаются к одному публичному
Colyseus endpoint. Для интернет-режима потребуется развернуть web-клиенты и server на публичном
хостинге, включить HTTPS/WSS и указать публичные `VITE_GAME_SERVER_URL` и `VITE_CONTROLLER_URL`.
Выбор hosting provider, домена, TLS и Redis adapter будет оформлен отдельным OpenSpec-изменением.

## Проверки

```powershell
pnpm check
pnpm spec:validate
pnpm smoke:network
pnpm test:e2e
```

## OpenSpec

Визуальный wave-MVP и художественный проход центрального замка завершены и сохранены в архивах
`2026-07-27-build-visual-wave-mvp` и `2026-07-27-castle-art-pass`. Основные актуальные спецификации:

```powershell
pnpm spec list
pnpm spec show shared-room-session --type spec
pnpm spec show deterministic-defense-loop --type spec
pnpm spec show shared-defense-economy --type spec
pnpm spec show visual-battlefield-rendering --type spec
```

Завершённые изменения находятся в `openspec/changes/archive/`.

## Структура

```text
apps/
  display/       общий экран: desktop browser и будущий Android TV shell
  controller/    браузерный контроллер игрока
  server/        authoritative Colyseus server
packages/
  protocol/      runtime schemas и общие TypeScript-контракты
  game-core/     чистая детерминированная симуляция
  config/        общие настройки
openspec/        спецификации и активные изменения
```
