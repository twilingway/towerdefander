## 1. Ассет

- [x] 1.1 Положить фон примера в `packages/sprite-assets/sources/backdrops/deep-nebula.png`
- [x] 1.2 `scripts/build-sprite-assets.mjs`: род `backdrop` — WebP q85 без изменения размера; запись
      манифеста с размерами
- [x] 1.3 Node-тест: байты совпадают с манифестом, файл не больше 384 КиБ

Проверка: `pnpm sprites:build` дважды подряд даёт пустой `git diff`;
`node --test scripts/build-sprite-assets.node-test.mjs`.

## 2. Пресет, ядро, сервер, провод

- [x] 2.1 `backgroundTuningSchema` → `{ image, parallaxStrength }`, `BACKDROP_IMAGES`;
      `BackgroundTuning` и значения по умолчанию в game-core
- [x] 2.2 Миграция `BALANCE_FILE_VERSION` +1: `image = "deep-nebula"`, три поля удаляются; тест на
      пресете предыдущей версии; `presets/production.json`
- [x] 2.3 `SpaceshipDefenderState`: `backgroundImage` вместо трёх полей; проекция в
      `stateProjection.ts` и `SpaceshipArenaRoom.ts`; `PROTOCOL_VERSION` +1
- [x] 2.4 Дисплей: разбор в `wire.ts` → `roomView.ts` → `parts.ts` с запасным `none`; фикстура
      `model/preview/world.ts`; фикстуры тестов из списка в design

Проверка: `pnpm --filter @spaceship-defender/protocol exec vitest run`,
`pnpm --filter @spaceship-defender/server exec vitest run src/balance src/rooms/SpaceshipDefenderRoom.test.ts`,
`pnpm typecheck`.

## 3. Слой фона в сцене

- [x] 3.1 `game/scene/backdrop.ts`: картинка с покрытием кадра и ограниченным смещением; `Blitter`
      звёзд с сидом, заворотом и мерцанием; ничего не создаётся при `none`
- [x] 3.2 Загрузка картинки в `preload` сцены, только когда забег её назвал; пересчёт на resize
- [x] 3.3 Чистые функции смещения и заворота — юнит-тесты: у края арены максимального радиуса
      смещение не больше запаса; заворот держит звезду в кадре
- [x] 3.4 Комментарий о мипмапах фона в `SpaceshipRuntime.ts` переписать под то, что есть

Проверка: `pnpm --filter @spaceship-defender/display exec vitest run src/game`.

## 4. Консоль

- [x] 4.1 «Космический фон» на «Директоре»: выбор картинки и сила параллакса вместо четырёх полей;
      подсказка
- [x] 4.2 Тест разметкой раздела

Проверка: `pnpm --filter @spaceship-defender/admin exec vitest run`.

## 5. Приёмка

- [x] 5.1 `pnpm check` с явным перехватом кода возврата; `pnpm spec:validate`
- [ ] 5.2 `node scripts/bench-panels.mjs --cpu=4 --plain --wave=5` с `none` и с `deep-nebula` на
      одном стенде; числа вписать в design.md до мерджа
- [x] 5.3 Ручная приёмка: нет полосы у края кадра на краю арены, нет движущейся линии в полёте,
      звёзды мерцают, выключенный фон не грузит картинку, фон на месте после переподключения
