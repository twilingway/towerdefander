# SpaceShip Defender

Кооперативный top-down space wave-defense для общего большого экрана и трёх игроков. Один
развиваемый космический корабль управляется из браузеров телефонов, планшетов или компьютеров:

- pilot перемещает корабль;
- gunner направляет орудие и стреляет;
- shield operator направляет и переключает энергетический щит.

Общий display запускается в desktop browser, на проекторе или Android TV. Игроки подключаются через
LAN/Wi-Fi или интернет. Node.js/Colyseus server является единственным источником trusted gameplay
state; клиенты отправляют только intents.

## Текущий gameplay

- deterministic fixed-step simulation 20 Hz и protocol v17;
- круглая server-authoritative арена `4400×4400`, радиус `2200`, кадр камеры настраивается балансом;
- каталог из пяти врагов — перехватчик, ганшип, снайпер, ракетоносец и босс, — который редактируется
  из консоли баланса без пересборки сервера;
- явная таблица волн поверх процедурного директора и постоянный поток астероидов с разных сторон
  арены;
- у каждого орудия врага своя дальность открытия огня: вне её ствол молчит и держит заряд;
- friendly/hostile projectiles и limited-turn homing missiles;
- swept collisions, HP, damage, score, общий credits balance и directional shield interception;
- 30-секундное командное голосование за один платный role upgrade между волнами;
- 20-минутный server-authoritative deadline каждой combat wave с отдельной причиной timeout defeat;
- defeat, unanimous rematch в той же комнате, reconnect и replacement;
- автоматические TTL комнат и read-only `/stats/rooms`;
- Phaser primitives на display и responsive React controllers.

Product north star — уничтожать нарастающие волны, зарабатывать credits и модернизировать корпус,
щиты и оружие. Первый economy slice использует общий кошелёк и одну командную покупку между волнами;
покупки непосредственно во время combat остаются будущим расширением.

## Визуальное направление

Цель — оригинальный 2D pseudo-3D корабль, глубокие многослойные космические backgrounds, parallax,
современные particles и shaders. Нужна атмосфера красивого глубокого космоса, а не копирование чужих
assets или интерфейсов.

В проект не входят настоящий 3D renderer, торговая/навигационная карта, торговля и RPG systems.

## Структура

```text
apps/
  display/       React HUD + Phaser world для большого экрана
  controller/    responsive browser controllers трёх ролей
  server/        authoritative Colyseus room, lifecycle и statistics
  admin/         консоль баланса: волны, враги, директор, камера
packages/
  protocol/      protocol v17 schemas и shared contracts
  game-core/     pure deterministic simulation без DOM/network/timers
  config/        shared TypeScript configuration
openspec/        current specs и change lifecycle
```

## Требования и запуск

- Node.js 22 или новее;
- pnpm 10.34.5 через Corepack.

```powershell
corepack enable pnpm
pnpm install
Copy-Item .env.example .env.local
pnpm dev
```

Локальные адреса:

- display: `http://localhost:5173`;
- controller: `http://localhost:5174`;
- консоль баланса: `http://localhost:5175`;
- server/health: `http://localhost:2567` и `http://localhost:2567/health`;
- room statistics: `http://localhost:2567/stats/rooms`.

Lifecycle defaults задаются в `.env.example`: lobby 15 минут, одна combat wave 20 минут, result 10
минут, отсутствие controller identities 5 минут и несбрасываемый hard lifetime комнаты 12 часов.
Wave timeout завершает run результатом и оставляет экипажу обычный unanimous rematch; новый run не
продлевает hard lifetime исходной комнаты.

## Видимая автоматическая демонстрация

```powershell
pnpm demo:visible
```

Команда сначала собирает authoritative server, затем поднимает изолированные local services и
открывает обычный Chrome. Три SDK-контроллера подключаются как pilot/gunner/shield, проходят бой,
голосуют за общий upgrade между волнами и продолжают следующие волны. В overlay доступны «Пауза
автопилота», «Продолжить» и Stop. Пауза останавливает только автоматические команды: серверная
симуляция и враги продолжают работать. Stop или закрытие Chrome нейтрализует роли и завершает только
процессы этой демонстрации.

Конечная headless-проверка того же сценария запускается отдельно и не входит в `pnpm check`:

```powershell
pnpm demo:verify
```

Auto-crew является только developer harness. Будущие NPC будут server-owned actors и не будут
использовать браузерные SDK connections как production authority.

Для телефона замените `localhost` в `.env.local` на LAN-адрес компьютера. Для internet deployment
нужны HTTPS/WSS, публичные client/server endpoints и TLS reverse proxy. Без `ROOM_STATS_PASSWORD`
statistics доступны только с loopback; удалённый доступ использует Basic `admin:<password>` за TLS.

## Консоль баланса

Консоль поднимается вместе с `pnpm dev` на `:5175` и правит активный пресет через защищённый
`/admin/balance`: таблицу волн, каталог врагов с орудиями и дальностями огня, параметры директора и
кадр камеры мира. Сохранённый пресет применяется со следующего запуска боя, идущий бой не меняется.

Пресеты лежат в файле версии `7` по пути `BALANCE_PRESET_PATH` (по умолчанию
`apps/server/data/balance.json`, не в git). Файл не обязателен: без него сервер работает на
встроенных значениях, а файл прежней версии мигрируется при загрузке. Как и statistics, API доступен
с loopback без пароля; удалённый доступ требует `ADMIN_BALANCE_PASSWORD` и TLS.

Кадр камеры удобно подбирать в dev-превью дисплея: `http://localhost:5173/?preview=1` рисует
фикстуру без сервера и даёт ползунок ширины кадра, значение которого затем вбивается в консоль.

## Проверки

```powershell
pnpm check
pnpm spec:validate
pnpm smoke:network
pnpm test:e2e
pnpm benchmark:combat
```

Состояние OpenSpec и архив завершённого identity refactor:

```powershell
pnpm spec list
pnpm spec:validate
```

Завершённый identity refactor хранится в
`openspec/changes/archive/2026-08-23-spaceship-defender-identity-refactor/` как immutable history.
