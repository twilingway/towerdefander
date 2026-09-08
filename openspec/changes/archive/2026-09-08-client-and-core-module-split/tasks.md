# Задачи

Артефакты написаны по факту выполненной работы: разрез шёл шагами, каждый закрывался полным гейтом и
отдельным коммитом.

## 1. Общий клиентский пакет

- [x] 1.1 Завести `packages/client-shared` по образцу `packages/protocol` — экспорт
      `./src/index.ts`, без сборки. Проверка: `pnpm --filter @spaceship-defender/client-shared test`
- [x] 1.2 Перенести словарь превью, рамку панели превью, `formatLatency`, `roleLabel` и чтение
      окружения; удалить копии в обоих приложениях. Проверка: `git grep "function formatLatency"`
      находит одно определение
- [x] 1.3 Оставить метры дублированными: у display разметка `.hud-energy` с `<i>`, у controller
      `.shield-energy` со `<span>`, слияние поменяло бы DOM. Проверка: `pnpm test:e2e`

## 2. Консоль баланса

- [x] 2.1 Вынести шесть экранов в `screens/<Name>/`, примитивы полей в `components/fields.tsx`,
      помощники пресета в `model/tuning.ts`. Проверка:
      `pnpm --filter @spaceship-defender/admin test`
- [x] 2.2 Заменить тернарную цепочку вкладок на `SCREENS: Record<Tab, …>`. Проверка: раздел
      добавляется одной записью, оболочка не меняется
- [x] 2.3 Дорезать `EnemiesScreen` и `PlayerScreen` по секциям карточки и корабля. Проверка: ни один
      production `.tsx` в `apps/admin` не длиннее 500 строк

## 3. Контроллер

- [x] 3.1 Вынести панели, оверлеи и чистые помощники; ввод роли — в хук `useRoleControls`. Проверка:
      `pnpm --filter @spaceship-defender/controller test` — 62 случая до и после
- [x] 3.2 Свести три инлайновых прогрессбара в `components/Meter`. Проверка: `pnpm test:e2e`
- [x] 3.3 Разложить `App.test.tsx` по модулям, которые он проверяет. Проверка: число тестов не
      изменилось

## 4. Общий экран

- [x] 4.1 Вынести экран создания комнаты, раскладку лобби и оверлей пингов; подписи — в
      `model/labels.ts`. Проверка: `pnpm --filter @spaceship-defender/display test`
- [x] 4.2 Не трогать `game/` и `SpaceshipCanvas`: граница React/Phaser уже отдаёт plain data через
      динамический импорт. Проверка: `pnpm test:e2e`

## 5. Комната

- [x] 5.1 Превратить зеркало состояния в чистую `projectGameState(target, game, config, deadline)`.
      Проверка: `pnpm --filter @spaceship-defender/server test`
- [x] 5.2 Вынести декоративные препятствия, дедлайны, журнал апгрейдов, сид забега и медиану.
      Проверка: `pnpm smoke:network`

## 6. Ядро симуляции

- [x] 6.1 Разрезать `combat.ts` на типы, константы, валидацию, директор волн, апгрейды, движение,
      спавн, коллизии, сетку, RNG и математику. Проверка:
      `pnpm --filter @spaceship-defender/game-core test`
- [x] 6.2 Разрезать `spaceshipSimulation.ts`: дефолтный баланс, ввод, математика, валидация конфига.
      Проверка: 146 тестов ядра проходят без правок
- [x] 6.3 Сохранить публичную поверхность пакета один-в-один через реэкспорты. Проверка:
      `pnpm typecheck` по всем пакетам без правок в потребителях

## 7. Правила и проверка

- [x] 7.1 Написать `docs/CODE_STYLE.md` и сослаться на него из `CLAUDE.md` и `AGENTS.md`
- [x] 7.2 Прогнать полный гейт: `pnpm check`
- [x] 7.3 Провалидировать изменение: `pnpm spec:validate`
