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

- deterministic fixed-step simulation 20 Hz и protocol v46;
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

Автопилот ведёт бой по уровню из активного пресета баланса — его выбирают и настраивают на вкладке
«Автопилот» в консоли на `:5175`. Уровень читается один раз при запуске демонстрации, поэтому идущий
прогон правку не подхватывает. Для разового прогона уровень перекрывается переменной
`DEMO_BOT_LEVEL` (`rookie`, `veteran`, `ace`).

Конечная headless-проверка того же сценария запускается отдельно и не входит в `pnpm check`; она
закреплена на уровне `rookie`, чтобы проверять транспорт, а не мастерство бота:

```powershell
pnpm demo:verify
```

Auto-crew является только developer harness. Будущие NPC будут server-owned actors и не будут
использовать браузерные SDK connections как production authority.

Для телефона замените `localhost` в `.env.local` на LAN-адрес компьютера. Публичное развёртывание
уже существует и описано ниже, в разделе «Прод». Без `ROOM_STATS_PASSWORD` statistics доступны
только с loopback; удалённый доступ использует Basic `admin:<password>` за TLS.

## Прод

Игра развёрнута на домашнем Mac mini за Nginx Proxy Manager. Наружу открыты только 80 и 443.

| Адрес                                   | Что                      | Кому виден            |
| --------------------------------------- | ------------------------ | --------------------- |
| `https://space.twiling.ru`              | общий экран              | из интернета          |
| `https://control.space.twiling.ru`      | контроллеры, цель QR     | из интернета          |
| `wss://api.space.twiling.ru`            | Colyseus API и WebSocket | из интернета          |
| `http://192.168.1.163:8081`             | консоль баланса          | только локальная сеть |
| `http://192.168.1.163:8081/stats/rooms` | панель комнат            | только локальная сеть |

Административные пути на публичном домене API закрыты прокси и отвечают 404: игровой API и консоль
живут в одном процессе на одном порту, поэтому публикация домена вынесла бы консоль наружу под одним
лишь паролем. Консоль ходит к API напрямую по сети Docker, а не через публичный домен.

`/admin/*` и `/stats/*` требуют Basic `admin:<пароль>` — разрешение по loopback за прокси не
срабатывает, там адрес сокета принадлежит прокси. Пароли: `ADMIN_BALANCE_PASSWORD` для баланса и
статистики, `ROOM_STATS_PASSWORD` для панели комнат, `DEPLOY_CONTROL_TOKEN` для окна технических
работ — последний отдельно, потому что правка чисел и остановка чужих партий это разные полномочия.

Вливание в `main` выкатывается само: GitHub Actions прогоняет гейт, агент на самой машине опрашивает
ветку и релизит зелёный коммит. Неудачный релиз возвращает предыдущий образ. Подробности
развёртывания, отката, переноса и режима технических работ — в
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Консоль баланса

Консоль поднимается вместе с `pnpm dev` на `:5175` и правит активный пресет через защищённый
`/admin/balance`: таблицу волн, каталог врагов с орудиями и дальностями огня, корабль игрока, уровни
демонстрационного автопилота, параметры директора и кадр камеры мира. Сохранённый пресет применяется
со следующего запуска боя, идущий бой не меняется.

Пресеты лежат в файле версии `34` по пути `BALANCE_PRESET_PATH` (по умолчанию
`apps/server/data/balance.json`, не в git). Файл не обязателен: без него сервер работает на
встроенных значениях, а файл прежней версии мигрируется при загрузке. Как и statistics, API доступен
с loopback без пароля; удалённый доступ требует `ADMIN_BALANCE_PASSWORD` и TLS.

Кадр камеры удобно подбирать в dev-превью дисплея: `http://localhost:5173/?preview=1` рисует
фикстуру без сервера и даёт ползунок ширины кадра, значение которого затем вбивается в консоль.

## Что чем запускать

Ручки, которые нужны чаще всего. Каждая держит свой блок портов, поэтому запускается поверх идущего
`pnpm dev`.

| Команда                                            | Что делает                                                                       |
| -------------------------------------------------- | -------------------------------------------------------------------------------- |
| `pnpm demo:visible`                                | Обычный Chrome, три бота играют прогон на корпусе из пресета                     |
| `pnpm demo:guardian`, `demo:blade`, `demo:bastion` | То же, но на конкретном корпусе                                                  |
| `pnpm demo:boss`                                   | Открывает прогон сразу на пятой волне, чтобы смотреть босса, а не идти к нему    |
| `pnpm demo:verify`                                 | Тот же сценарий headless, с проверкой девяти признаков; вне `pnpm check`         |
| `pnpm stats:autopilot`                             | Один замер: N прогонов на одном пресете, уровне и корпусе                        |
| `pnpm stats:matrix`                                | Вся матрица: три уровня на трёх корпусах, по 20 прогонов, до 30 волн             |
| `pnpm stats:batch ...`                             | То же вручную: `--levels`, `--hulls`, `--runs`, `--seed`, `--max-waves`, `--out` |
| `pnpm campaign:preview`                            | Показать, что соберёт генератор кампании, ничего не записывая                    |
| `pnpm campaign:author`                             | Пересобрать каталог врагов и таблицу волн в пресет (пишет `.bak`)                |
| `pnpm benchmark:combat`                            | Худший случай шага симуляции и объём патчей состояния                            |

Переменные окружения для демонстрации: `DEMO_SHIP` (`guardian`, `blade`, `bastion`),
`DEMO_BOT_LEVEL` (`rookie`, `veteran`, `ace`), `DEMO_START_WAVE` (номер волны).

Кампания собирается по числам из пресета — вкладка «Кампания волн» в консоли, карточка «Правила
сборки кампании»: бюджет волны и его прирост, шаг между группами и интервалы внутри группы, пол
босса, здоровье в выстрелах пушки, потолки урона. Поменяли числа — сохранили пресет — прогнали
`pnpm campaign:author`, иначе таблица останется прежней.

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
