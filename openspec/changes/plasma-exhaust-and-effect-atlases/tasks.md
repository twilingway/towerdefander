## 1. Инструмент авторинга

- [x] 1.1 Подключить редактор submodule-ом в `tools/arcadia-effects`, добавить рут-скрипты `fx:bake`
      и `fx:editor`, дописать в `CLAUDE.md` строку про `git submodule update --init --recursive` и
      две команды в таблицу.
- [x] 1.2 Завести скилл: полный текст в `.agents/skills/arcadia-effects/SKILL.md`, указатель с
      границами в `.claude/skills/arcadia-effects/SKILL.md`, ссылка из раздела Agent tooling
      `CLAUDE.md`.

## 2. Пакет запечённых ассетов

- [x] 2.1 Создать `packages/fx-assets`: `package.json` по шаблону `protocol`, `tsconfig.json` с
      `lib: ["ES2023", "DOM"]` (манифест берёт `URL` и `import.meta.url`), `src/types.ts`
      (`FX_CATEGORIES`, `FxAtlasMeta`, `FxEffect`), `src/index.ts` с `getFxEffect`,
      `getFxEffectsByCategory`, `getPopulatedFxCategories`, `getFxFrameOffset`.
- [x] 2.2 Покрыть пакет тестом целостности манифеста: уникальные id, `frames ≤ cols·rows`,
      положительные размеры, известные категории, обход кадров и кламп. Проверка:
      `pnpm --filter @spaceship-defender/fx-assets test`.
- [x] 2.3 Добавить `NOTICE.md` с атрибуцией MIT: два исходника производны от заводской библиотеки
      редактора, два собраны по рецептам.

## 3. Запекание

- [x] 3.1 Написать `scripts/bake-fx-atlases.mjs` по домашнему стилю (`parseArgs`, пути от
      `import.meta.url`, атомарная запись, NDJSON): своя статика над папкой редактора на 35179,
      системный Chrome, `AFX.Model.loadEffectFile` + `AFX.Atlas.build`, вывод `<id>.png`,
      `<id>.meta.json` и `src/manifest.ts`.
- [x] 3.2 Добавить проверку, которая может покраснеть: максимум альфы по каждой ячейке, падение на
      пустом кадре. Проверка: прогон на `muzzle-flash` с окном за хвостом слоёв падает, с
      подрезанным `t1` проходит.
- [x] 3.3 Написать `scripts/bake-fx-atlases.node-test.mjs` и включить его в рут-`test`: каждый
      исходник описан в каталоге, манифест совпадает с исходниками, размер и сетка каждого PNG
      совпадают с манифестом и метой, вес под 512 КБ. Проверка:
      `node --test scripts/bake-fx-atlases.node-test.mjs`, и она краснеет на подмене `bytes`.

## 4. Эффекты

- [x] 4.1 Собрать `plasma-exhaust` от эталона `Flame Pro`: сопло, а не свечка — горло на нижней
      кромке композиции, `drag 1.3` при `speed 600` и `life 0.62` (~315 px хода), аспект композиции
      равен аспекту ячейки, окно 1.5…2.0 — два периода пыха в стационаре.
- [x] 4.2 Собрать `muzzle-flash` направленным, по тому же соглашению «вверх».
- [x] 4.3 Перенести `explosion` и `debris-burst` от эталонов `Explosion` и `Shockwave`: `cam.comp`
      37 → 0, кольца волны — в круги, наши стабильные id и английские имена слоёв.
- [x] 4.4 Заполнить `effects/catalogue.json` (title, category, hint, `oriented`, `loop`) и запечь.
      Проверка: `node tools/validate.mjs` на всех четырёх без ошибок, `pnpm fx:bake` без пустых
      кадров, ревью-копия в режиме `black` просмотрена.

## 5. Выхлоп на дисплее

- [x] 5.1 Добавить в `spaceshipViewModel.ts` чистую `getExhaustPlume` и константы
      `EXHAUST_THROAT_UNITS`, `EXHAUST_ROTATION_OFFSET`: throttle как проекция скорости на курс,
      зажатая в ноль, знаменатель — `drive.speedPerSecond`.
- [x] 5.2 Покрыть её тестами: стоящий корабль, реверс, чистый снос боком, только продольная
      составляющая, монотонный рост, кламп за максимумом, нулевой максимум. Проверка:
      `pnpm --filter @spaceship-defender/display exec vitest run src/game/spaceshipViewModel.test.ts`
      — и подмена проекции на `Math.hypot` роняет ровно три из них.
- [x] 5.3 Написать `scene/exhaust.ts`: ленивая загрузка в `create()`, `anims.create` по мете,
      `origin (0.5, 1)`, depth 9, позиция через `turretMountPoint`, поворот `heading - PI/2`,
      подписка на `shutdown`/`destroy` сцены.
- [x] 5.4 Провести слой в `SpaceshipScene` (создание в `create`, вызов в `updateScene` от
      отрисованной позы) и добавить зависимость пакета. Проверка: `pnpm typecheck`, `pnpm build` —
      Vite эмитит атласы в `dist`.

## 6. Каталог в консоли

- [x] 6.1 Добавить вкладку `effects` в `screens/registry.tsx` (id, подпись, путь, адаптер без слайса
      контекста) — `App.tsx` не трогать.
- [x] 6.2 Написать `screens/EffectsScreen/`: чистая `playback.ts` (кадр от времени, окно кадра,
      формат веса), `EffectPreview.tsx` с плей-паузой и покадровой прокруткой, `index.tsx` с
      фильтром категорий и сеткой миниатюр; классы — в `styles.css`.
- [x] 6.3 Покрыть тестами: чистая математика кадров отдельно, экран — через `renderToStaticMarkup`
      (карточка на каждый эффект, чип на каждую заполненную категорию, превью первого выбранного).
      Проверка: `pnpm --filter @spaceship-defender/admin test`.

## 7. Смерти в бою

- [x] 7.1 Написать `scene/bursts.ts`: `burstKindFor` (босс — `explosion`, прочий враг — `debris`,
      всё остальное — ничего), пул односкладных спрайтов на depth 8 с потолком, и та же ленивая
      загрузка атласов, что у выхлопа.
- [x] 7.2 Провести его через `reconcileCombatVisuals`: `CombatVisual` несёт `burst` и `radius`,
      решённые при создании, а ветка удаления запускает вспышку — и молчит при `snap`, иначе
      реконнект засыпал бы экран взрывами.
- [x] 7.3 Покрыть решение тестом: у босса огненный шар, у прочего врага обломки, у снарядов, лута и
      астероидов ничего — астероид разрушаем, но он же и улетает с арены, и с этой стороны случаи
      неразличимы. Проверка: `pnpm --filter @spaceship-defender/display test`.

## 8. Спека и приёмка

- [x] 8.1 Оформить change: proposal, design с отклонёнными альтернативами, дельты на
      `primitive-top-down-battlefield`, `balance-admin-console`, `codebase-structure`. Проверка:
      `pnpm spec:validate`.
- [x] 8.2 Полный гейт: `pnpm check`.
- [x] 8.3 Замер кадра снят (после; «до» уже не снять — работа в `main`).
      `profile-display.mjs --cpu=4 --wave=8`: 42.3% простоя при четырёхкратном торможении
      процессора, анимированный спрайт в профиле не виден, выше него радар и обычная кухня Phaser.
      `bench-panels.mjs`: с интерфейсом 157 fps, кадр 6.1 мс среднее и 6.0 медиана, блокировок 0,
      сцена 0.3 мс, снимок → вид 0.2 мс, React 0.8 мс; без интерфейса 165 fps при тех же 6.1 · 6.0 и
      нуле блокировок. Каждая панель по отдельности не дороже 0.3 мс.
- [x] 8.4 Приёмка глазами пройдена: факел горит в полёте, а не на припаркованном корабле.
