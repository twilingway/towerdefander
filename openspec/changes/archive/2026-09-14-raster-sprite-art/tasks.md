## 1. Пакет спрайтов и сборка

- [x] 1.1 Положить пять исходных PNG из примера в `packages/sprite-assets/sources/sprites/` (корабль
      игрока, истребитель, сфера, тяжёлый, атлас астероидов)
- [x] 1.2 `scripts/build-sprite-assets.mjs`: ffmpeg → `sprites/<id>.webp` (ячейка обрезана по
      непрозрачной рамке и вписана в 256, атлас 1024×256, WebP q85 с альфой) и генерируемый
      `src/manifest.ts`
- [x] 1.3 `package.json`, `tsconfig`, `src/index.ts` (`getSpriteArt`), `README.md` с происхождением
      арта и срезом третьего камня; скрипт `sprites:build` в корне
- [x] 1.4 `scripts/build-sprite-assets.node-test.mjs`: байты и размеры файлов совпадают с
      манифестом, стороны — степени двойки, файл не больше 128 КиБ
- [x] 1.5 Проверить `docker/web.Dockerfile` по прецеденту `fx-assets`: собирается ли дисплей без
      отдельной строки `COPY packages/sprite-assets/package.json`

Проверка: `pnpm sprites:build` дважды подряд даёт пустой `git diff`;
`node --test scripts/build-sprite-assets.node-test.mjs`.

## 2. Каталог в протоколе

- [x] 2.1 `VisualAsset` → `VisualVectorAsset | VisualSpriteAsset` с `kind`; категория `asteroid`;
      пять идентификаторов в `VISUAL_ASSET_IDS` и `VISUAL_ASSETS`
- [x] 2.2 `visualCatalog.test.ts`: 75 ассетов, у спрайта `frames > 0`, у векторного непустые слои,
      категория `asteroid` заполнена
- [x] 2.3 Node-тест `scripts/build-sprite-assets.node-test.mjs` (как у атласов эффектов, чтобы пакет
      ассетов не зависел от протокола): у каждого спрайтового ассета протокола есть запись манифеста
      с тем же числом кадров, и наоборот
- [x] 2.4 `PROTOCOL_VERSION` 66 → 67, `BALANCE_FILE_VERSION` 52 → 54 (53 успел сохраниться на стенде
      оператора до поля носового оружия, поэтому он тоже в списке устаревших); фикстуры версий в
      тестах

Проверка: `pnpm --filter @spaceship-defender/protocol exec vitest run`,
`pnpm --filter @spaceship-defender/sprite-assets exec vitest run`,
`pnpm --filter @spaceship-defender/server exec vitest run src/balance`.

## 3. Дисплей

- [x] 3.1 `SpaceshipScene.preload`: все записи манифеста в загрузчик; не загрузившийся лист просто
      не попадает в кеш текстур
- [x] 3.2 `game/catalogTexture.ts` (`bakeCatalogArt`): вектор печётся как раньше, спрайт штампуется
      в `DynamicTexture` с поворотом и масштабом, ассет без листа идёт векторным путём с запасным
      силуэтом; кадр атласа — `fnv1a(id) % frames`
- [x] 3.3 Перевести на него корпус (`SpaceshipScene`), врага, камень и снаряд (`scene/entities.ts`),
      турель (`scene/ship.ts`), корпус и турель флота (`scene/arenaFleet.ts`)
- [x] 3.4 Юнит-тесты: кадр стабилен для id и различается для разных id; масштаб спрайта считается
      той же формулой, что у вектора; сломанный спрайт даёт запасной ассет

Проверка: `pnpm --filter @spaceship-defender/display exec vitest run src/game`, `pnpm typecheck`.

## 4. SVG и консоль

- [x] 4.1 `CatalogAssetShape`: спрайт через `<image>`, атлас — первым кадром через вложенный `<svg>`
- [x] 4.2 Консоль: подпись категории `asteroid`; выбор астероида на «Директоре» с категориями
      `asteroid`, `drone`, `missile`; подсказка под ним
- [x] 4.3 Тесты разметкой (`renderToStaticMarkup`): миниатюра спрайта и миниатюра атласа

Проверка: `pnpm --filter @spaceship-defender/client-shared exec vitest run`,
`pnpm --filter @spaceship-defender/admin exec vitest run`.

## 5. Документация и приёмка

- [x] 5.1 `CLAUDE.md`: `sprites:build` в таблице команд, `sprite-assets` в списке пакетов;
      актуальные номера версий
- [x] 5.2 `pnpm check` с явным перехватом кода возврата; `pnpm spec:validate`
- [x] 5.3 `node scripts/bench-panels.mjs --cpu=4` на волне со спрайтами против `main`: кадр не хуже
- [x] 5.4 Ручная приёмка оператором: размер корпуса-спрайта против круга поражения, враги-спрайты,
      разные и немигающие камни, миниатюры в консоли, двойной выхлоп на корпусе в движении

## 6. Добавлено оператором 2026-09-13

- [x] 6.1 Строка выбора внешнего вида показывает миниатюру выбранного ассета; тест разметкой
- [x] 6.2 Указатель носа уходит под корпус (глубина ниже корпуса)
- [x] 6.3 `machineGunVisual` (схема пушки на корпусе) в пресете, конфиге ядра, миграции в 54
      (`null`), display-only состоянии обеих комнат и разборе дисплея; фикстуры
- [x] 6.4 Дисплей рисует назначенное носовое оружие под корпусом в точке крепления, поворачивая с
      корпусом, в кампании и в матче; без назначения — указатель носа
- [x] 6.5 Консоль: «Носовое оружие» на «Игрок → Внешний вид» (ассет, масштаб, крепление, смещение) и
      в превью корабля; тесты разметкой
- [x] 6.6 Вращение камней: скорость и направление из id камня, только на дисплее; юнит-тест
      детерминированности

Проверка: `pnpm typecheck`, тесты затронутых пакетов, затем повторный `pnpm check`.
