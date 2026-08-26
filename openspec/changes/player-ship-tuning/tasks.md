## 1. Схема пресета

- [x] 1.1 Добавить в `balanceTuningSchema` тридцать два поля корабля плоско, с именами
      `SpaceshipSimulationConfig`, и nullable `spaceshipVisual`; знаки и целочисленность тиков — в
      zod, играбельность оставить `assertTuningIsPlayable`.
- [x] 1.2 Добавить `spaceshipVisual` и `shieldRadius` в `displayGameSnapshotSchema`, поднять
      `PROTOCOL_VERSION` до 19 и `BALANCE_FILE_VERSION` до 9, добавить 8 в
      `LEGACY_BALANCE_FILE_VERSIONS`; проверить
      `pnpm --filter @spaceship-defender/protocol exec vitest run`.

## 2. Ядро симуляции

- [x] 2.1 Добавить `spaceshipVisual` в `SpaceshipSimulationConfig` как presentation-only поле рядом
      с `cameraViewWidth` и `asteroidVisual`, с пустым дефолтом.
- [x] 2.2 Покрыть тестом, что внешний вид корпуса не влияет на прогон: два run с одним seed и
      разными корпусами совпадают по позициям, HP и наградам; проверить
      `pnpm --filter @spaceship-defender/game-core exec vitest run`.

## 3. Сервер

- [x] 3.1 Написать миграцию v8 → v9: недостающие числа корабля берутся из `createDefaultTuning()`,
      `spaceshipVisual` становится пустым; обновить док-комментарий миграций.
- [x] 3.2 Провести `spaceshipVisual` и `shieldRadius` через `SpaceshipDefenderState.ts`,
      `SpaceshipDefenderRoom.ts` и `apps/display/src/roomView.ts`.
- [x] 3.3 Покрыть тестами: документ версии 8 мигрирует и продолжает играться теми же числами,
      повторная миграция ничего не меняет, изменённые числа корабля доезжают до конфига нового run;
      сначала убедиться, что тест краснеет без миграции. Проверить
      `pnpm --filter @spaceship-defender/server exec vitest run src/balance/balance.test.ts`.

## 4. Дисплей

- [x] 4.1 Рисовать корпус игрока силуэтом из снапшота с откатом на вид по умолчанию вместо константы
      `SPACESHIP_HULL_ASSET_ID`.
- [x] 4.2 Рисовать дугу щита по авторитетному радиусу щита вместо литерала `радиус корабля + 34`.
- [x] 4.3 Покрыть тестами обе правки; проверить
      `pnpm --filter @spaceship-defender/display exec vitest run`.

## 5. Консоль баланса

- [x] 5.1 Добавить вкладку «Игрок» в `TABS` и `TAB_LABELS`.
- [x] 5.2 Написать `PlayerScreen` с превью корпуса, пикером корпуса (`allowNone`) и четырьмя
      секциями: корпус и ход, пушка, носовой пулемёт, щит; время — через `SecondsField`.
- [x] 5.3 Дописать глоссарий вкладки в том же стиле, что у экрана врагов, и проверить
      `pnpm --filter @spaceship-defender/admin exec vitest run`.

## 6. Проверка

- [x] 6.1 `pnpm check` и `pnpm spec:validate`; отчитаться, что прогнано и что пропущено с причиной.
- [ ] 6.2 Приёмка глазами: корпус игрока из консоли и сместившаяся дуга щита на реальном прогоне.
