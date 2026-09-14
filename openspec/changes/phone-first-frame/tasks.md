## 1. Протокол и ядро

- [x] 1.1 `balance.ts`: `CAMERA_VIEW_ASPECT = 9/19.5`, `cameraViewHeight`, `legacyFrameWidth`,
      пределы ширины 975…5363; `scanRadiusScreens` → `scanRadiusCells`; `BALANCE_FILE_VERSION` 58
- [x] 1.2 `index.ts`: `PROTOCOL_VERSION` 72; комментарии о пропорции; тесты протокола
- [x] 1.3 game-core: ширина кадра 3047, `ARENA_SCAN_RADIUS_CELLS = 1`

Проверка: `pnpm --filter @spaceship-defender/protocol exec vitest run`,
`pnpm --filter @spaceship-defender/game-core exec vitest run`.

## 2. Сервер

- [x] 2.1 Миграция 58: ширины из файла × 19.5/16 с округлением, только для файлов старше 58;
      `scanRadiusScreens` → `scanRadiusCells`; тест на файле 57 и на сиде
- [x] 2.2 `crewPolicy.mjs`: `frameRadius`, `sourceIsSpent`, догадка о стрелке через
      `legacyFrameWidth`; `crewPolicy.node-test.mjs` под новую пропорцию
- [ ] 2.3 Скан по клеткам в `SpaceshipArenaRoom.ts`; тест радиуса; значение состояния по умолчанию

Проверка: `pnpm --filter @spaceship-defender/server exec vitest run`,
`node --test apps/server/scripts/crewPolicy.node-test.mjs`.

## 3. Консоль

- [x] 3.1 Подсказки кадра 19.5:9 на «Директоре»; поле и подсказка скана в клетках на «Арене»; тексты
      «Автопилота» и «Руля», где они говорят о сторонах кадра (оба остаются верны: автопилот
      ограничен кадром, а проекцию прицела дисплей не читает)

Проверка: `pnpm --filter @spaceship-defender/admin exec vitest run`.

## 4. Дисплей: кадр

- [x] 4.1 Камера и превью под новую пропорцию; ширина превью 2681; подпись ползунка превью
- [x] 4.2 Звук через `legacyFrameWidth`; небо: запас картинки и число звёзд от кадра (правка не
      понадобилась: небо считается от холста и зума)
- [x] 4.3 `useWorldFrame`: переменные прямоугольника кадра на оболочке боя; юнит-тест расчёта

Проверка: `pnpm --filter @spaceship-defender/display exec vitest run`, `pnpm typecheck`.

## 5. Дисплей: HUD

- [x] 5.1 Рамка сведений, таймер, рамка состояния и радар у кадра мира; верхний ряд в полосе, где
      она есть
- [x] 5.2 Стики и кнопки у краёв экрана с safe area; нажимаемое не меньше 44 px и не ближе 16 px к
      краю
- [ ] 5.3 Снимки кампании и матча на 15 размерах после правок; аудит Codex; исправления по нему

Проверка: снимки `live-*` на всех размерах без ошибок страницы; сравнение с «до».

## 6. Тесты e2e и документы

- [ ] 6.1 `viewport.spec.ts`: оси полос на 1920×1080 и 3440×1440, телефон 19.5:9 без полос
- [ ] 6.2 `shieldGlow.spec.ts`: эталон без полос 19.5:9, комментарии о полосах
- [x] 6.3 `spaceshipViewModel.test.ts`: размеры кадра через пропорцию, а не `9 / 16`
- [x] 6.4 `docs/GAME_DESIGN_DOCUMENT.md` и `CLAUDE.md`: кадр и версии

Проверка: `pnpm test:e2e`.

## 7. Приёмка

- [ ] 7.1 `pnpm check` с перехватом кода возврата; `pnpm spec:validate`
- [ ] 7.2 Страница «до и после» для оператора; мердж после его приёмки
