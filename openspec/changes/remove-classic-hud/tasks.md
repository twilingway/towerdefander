## 1. Протокол и ядро

- [ ] 1.1 `balance.ts`: убрать `HUD_SKINS`, `hudSkinSchema`, `HudSkin` и поле `hudSkin`;
      `BALANCE_FILE_VERSION` 57, версия 56 — в список старых
- [ ] 1.2 `index.ts`: поле `hudSkin` из снимка боя дисплея; `PROTOCOL_VERSION` 71; тесты протокола;
      номер версии в `CLAUDE.md`
- [ ] 1.3 game-core: поле конфигурации и значение по умолчанию

Проверка: `pnpm --filter @spaceship-defender/protocol exec vitest run`,
`pnpm --filter @spaceship-defender/game-core exec vitest run`.

## 2. Сервер

- [ ] 2.1 Поле состояния; проекция в `stateProjection.ts` и `SpaceshipArenaRoom.ts`
- [ ] 2.2 Миграция: пресет старой версии теряет `hudSkin`; тест на файле версии 56 с пресетами в
      классике и в рамках — файл принят, поля нет, волны на месте

Проверка: `pnpm --filter @spaceship-defender/server exec vitest run src/balance src/rooms`.

## 3. Консоль

- [ ] 3.1 Раздел «Оформление HUD», подписи; тесты и фикстуры

Проверка: `pnpm --filter @spaceship-defender/admin exec vitest run`.

## 4. Дисплей

- [ ] 4.1 Разбор снимка без оформления; одна раскладка частей боя; шапка без условия по оформлению;
      постоянный `data-hud-skin="frame"`
- [ ] 4.2 Классические панели и компоненты удалены вместе с тестами; `formatScanClock` и
      `formatWaveCountdown` там, где их берут рамки
- [ ] 4.3 `useCockpitKeyboard`, `liveHeat.ts`, `combatRadarPainter.ts`, `useLetterboxBars` — без
      классических веток
- [ ] 4.4 Превью без переключателя оформления; фикстуры в рамках
- [ ] 4.5 Стили: правила только классики и классические элементы смешанных списков удалены;
      комментарии о классике переписаны

Проверка: `pnpm --filter @spaceship-defender/display exec vitest run`, `pnpm typecheck`,
`pnpm lint`.

## 5. e2e и документы

- [ ] 5.1 `network-room.spec.ts`, `arena-cockpit.spec.ts`, `scripts/layout-sweep.mjs` проверяют
      рамки
- [ ] 5.2 `docs/GAME_DESIGN_DOCUMENT.md` описывает HUD в рамках; в `hud-skin-choice` задача 6.2
      отмечена отменённой

Проверка: `pnpm test:e2e`.

## 6. Приёмка

- [ ] 6.1 `pnpm check` с перехватом кода возврата; `pnpm spec:validate`
- [ ] 6.2 Снимки боя кампании и матча на 1920×1080 и 844×390: рамки на месте, классических элементов
      нет
- [ ] 6.3 Поиск `classic` и «классик» по репозиторию: остаются только архив OpenSpec, миграция и
      сама эта change
