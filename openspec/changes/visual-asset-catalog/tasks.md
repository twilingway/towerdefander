## 1. Каталог в protocol

- [x] 1.1 Перенести 70 ассетов прототипа в `packages/protocol/src/visualCatalog.ts`: палитра,
      размеченное объединение `VisualLayer`, категории, `VISUAL_ASSETS`, кортеж `VISUAL_ASSET_IDS`,
      `visualAssetIdSchema`, `getVisualAsset`, `FALLBACK_VISUAL_ASSET_ID`; реэкспорт из бочки.
- [x] 1.2 Покрыть каталог тестом целостности: 70 записей, уникальные id, совпадение с
      `VISUAL_ASSET_IDS`, положительный радиус, непустые слои, каждый строковый цвет слоя есть в
      палитре либо равен accent, каждая категория непуста; проверить
      `pnpm --filter @spaceship-defender/protocol exec vitest run src/visualCatalog.test.ts`.

## 2. Схемы протокола

- [x] 2.1 Убрать `color` и `outline` из `enemyVisualSchema` и `publicEnemyCatalogueEntrySchema`,
      перевести `shape` на `visualAssetIdSchema`, удалить `ENEMY_SHAPES`, `EnemyShape` и
      `FALLBACK_ENEMY_SHAPE` из `enemyKinds.ts`.
- [x] 2.2 Добавить необязательный `visual` в `enemyWeaponTuningSchema`, необязательный
      `asteroidShape` в `balanceTuningSchema` и `displayGameSnapshotSchema`, необязательный `shape`
      в `publicProjectileViewSchema` и `publicHomingMissileViewSchema`.
- [x] 2.3 Поднять `PROTOCOL_VERSION` до 18 и `BALANCE_FILE_VERSION` до 8, добавить 7 в
      `LEGACY_BALANCE_FILE_VERSIONS`; проверить
      `pnpm --filter @spaceship-defender/protocol exec vitest run`.

## 3. Ядро симуляции

- [x] 3.1 Удалить копию `ENEMY_SHAPES` из `combat.ts`, свести `EnemyVisual` к трём полям и заменить
      проверку формы в `validateSpaceshipSimulationConfig` на проверку непустой строки.
- [x] 3.2 Провести визуал оружия на инстансы: необязательный `visual` в `EnemyWeaponTuning`, `shape`
      в `HostileProjectileState` и `HomingMissileState`, заполнение там же, где копируются `damage`
      и `shieldHitCost`; добавить `asteroidShape` в конфиг симуляции с пустым дефолтом.
- [x] 3.3 Обновить встроенные архетипы под таблицу дефолтов и поправить фикстуры тестов; проверить
      `pnpm --filter @spaceship-defender/game-core exec vitest run` — визуал ствола доезжает до
      снаряда и ракеты, состав и детерминизм волн не меняются.

## 4. Сервер

- [x] 4.1 Написать миграцию v7 в v8 в `balance/store.ts` (таблица силуэтов, снятие цветов, пустой
      визуал оружия и астероида) и обновить док-комментарий миграций.
- [x] 4.2 Провести новые поля через `SpaceshipDefenderState.ts` и `SpaceshipDefenderRoom.ts`:
      `EnemyVisualState` без цветов, `shape` на снарядах и ракетах, `asteroidShape` в
      display-проекции; те же поля в `apps/display/src/roomView.ts`.
- [x] 4.3 Покрыть миграцию тестом: каждый старый силуэт даёт ожидаемый id, цвета исчезают, визуалы
      становятся пустыми, повторная миграция ничего не меняет; сначала убедиться, что тест краснеет
      без подключённой таблицы. Проверить
      `pnpm --filter @spaceship-defender/server exec vitest run src/balance/balance.test.ts`.

## 5. Дисплей

- [x] 5.1 Написать `apps/display/src/game/catalogRenderer.ts`: рисовалка слоёв, нормализация по
      номинальному радиусу ассета, доворот на четверть оборота.
- [x] 5.2 Удалить `ENEMY_SHAPE_DRAWERS` и `regularPolygon`, перевести `drawEnemyBody` на каталог с
      откатом на запасной ассет, снять цвета с `FALLBACK_ENEMY_VISUAL`.
- [x] 5.3 Учесть визуал снаряда, ракеты и астероида в `createCombatVisual`, сохранив нынешний вид
      при пустом визуале.
- [x] 5.4 Нарисовать корпус игрока силуэтом `ship-dart` и вращать его по `headingTransition` рядом с
      указателем носа.
- [x] 5.5 Переписать `enemyVisuals.test.ts` под каталог: нормализация по авторитетному радиусу,
      доворот, откат на запасной ассет; проверить
      `pnpm --filter @spaceship-defender/display exec vitest run`.

## 6. Консоль баланса

- [x] 6.1 Написать `apps/admin/src/catalogSvg.tsx` — SVG-зеркало рендерера, включая дуги через
      `path`; перевести `enemyShapes.ts` на габариты по слоям ассета и обновить его тест.
- [x] 6.2 Написать `apps/admin/src/AssetPicker.tsx`: поиск, чипы категорий, сетка миниатюр,
      выделение выбранного, режим сброса в вид по умолчанию.
- [x] 6.3 Подключить пикер в `EnemiesScreen` — к архетипу и к каждому стволу, — убрать чипы форм,
      два color-инпута и `SHAPE_LABELS`, обновить шаблон нового архетипа; подключить пикер астероида
      в `DirectorScreen`.
- [x] 6.4 Перевести `EnemyPreview` на каталог, сохранив круги поражения и корпуса, полосу HP и
      подписи; проверить `pnpm --filter @spaceship-defender/admin exec vitest run`.

## 7. Проверка

- [x] 7.1 `pnpm check` и `pnpm spec:validate`; отчитаться, что прогнано и что пропущено с причиной.
- [ ] 7.2 Приёмка глазами на реальном прогоне: читаемость силуэтов в бою и корпуса игрока.
