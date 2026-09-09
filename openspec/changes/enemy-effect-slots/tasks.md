## 1. Каталог эффектов в протоколе

- [x] 1.1 Написать `packages/protocol/src/effectCatalogue.ts`: кортеж `FX_EFFECT_IDS`,
      `fxEffectIdSchema`, тип `FxEffectId`; реэкспорт из бочки.
- [x] 1.2 Сверить манифест `fx-assets` с этим списком тестом пакета — запечённый эффект без записи в
      протоколе SHALL валить тест. Проверка: `pnpm --filter @spaceship-defender/fx-assets test`, и
      она краснеет, если убрать id из кортежа.

## 2. Схемы

- [x] 2.1 Добавить необязательный блок эффектов (`death`, `hit`, `shot`) в `enemyVisualSchema`
      (`balance.ts`) и в `publicEnemyCatalogueEntrySchema` (`index.ts`).
- [x] 2.2 Добавить `shotsFired` в `publicEnemyViewSchema`.
- [x] 2.3 Поднять `PROTOCOL_VERSION` 52 → 53 и `BALANCE_FILE_VERSION` 38 → 39, дописать 38 в
      `LEGACY_BALANCE_FILE_VERSIONS`. Проверка: `pnpm --filter @spaceship-defender/protocol test`.

## 3. Ядро симуляции

- [x] 3.1 Добавить `shotsFired` в `CombatEnemyState`, нулём при спавне, и инкрементировать его в
      `threats.ts` там же, где сбрасывается перезарядка — один раз за тик, сколько бы стволов ни
      выстрелило.
- [x] 3.2 Проверить, что состав и детерминизм волн не поехали:
      `pnpm --filter @spaceship-defender/game-core test`.

## 4. Сервер

- [x] 4.1 Миграция шага не потребовалась — блок эффектов необязательный, и пресет v38 валиден без
      него; хватило версии в `LEGACY_BALANCE_FILE_VERSIONS`. **Зато бамп вскрыл латентную ошибку:**
      пересчёт тиков 20→60 Гц применялся к любому legacy-файлу, а не только к написанным до смены
      частоты, и утроил закоммиченный сид, как только тот стал на версию старше. Пересчёт теперь
      закрыт `FIRST_60_HZ_BALANCE_VERSION`; регрессия покрыта тестом, который краснеет при снятии
      этого условия.
- [x] 4.2 Провести поля через `SpaceshipDefenderState.ts` (`EnemyState.shotsFired` как `uint16`,
      эффекты в `EnemyVisualState`) и проекцию. Проверка:
      `pnpm --filter @spaceship-defender/server test`.

## 5. Дисплей

- [x] 5.1 Провести новые поля через `apps/display/src/roomView` и его типы.
- [x] 5.2 Заменить захардкоженное правило в `scene/bursts.ts` на «слот архетипа, иначе нынешнее
      правило», и добавить эффекты попадания и выстрела: ловятся сравнением с последним отрисованным
      значением на `CombatVisual`, у попадания — минимальный интервал между повторами, иначе луч
      даёт стробоскоп.
- [x] 5.3 Покрыть выбор и троттлинг тестами чистых функций. Проверка:
      `pnpm --filter @spaceship-defender/display test` — и подмена «слот важнее фолбэка» на обратное
      роняет тест.
- [x] 5.4 Вспыхнуть своими стволами: точка из `turretMountPoint`, момент из появления своего снаряда
      с `source: cannon | machineGun`.

## 6. Консоль

- [x] 6.1 Добавить в экран врагов выбор эффекта на каждый слот, с миниатюрой и сбросом в «как
      сейчас»; переиспользовать приём `AssetPicker`.
- [x] 6.2 Покрыть через `renderToStaticMarkup`. Проверка:
      `pnpm --filter @spaceship-defender/admin test`.

## 7. Приёмка

- [ ] 7.1 `pnpm check` с явным перехватом кода возврата и `pnpm spec:validate`.
- [ ] 7.2 Замер кадра: `node scripts/profile-display.mjs --cpu=4 --wave=8` — в кадре появились ещё
      два источника вспышек.
- [ ] 7.3 Приёмка глазами: назначить архетипу эффекты в консоли, увидеть их в бою.
