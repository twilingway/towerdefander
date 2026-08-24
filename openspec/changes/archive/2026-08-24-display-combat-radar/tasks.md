## 1. Чистая модель HUD

- [x] 1.1 Добавить безопасный расчёт процента нагрева и world-to-radar projection.
- [x] 1.2 Покрыть unit-тестами центр/границы проекции и нулевую capacity.

## 2. Display UI

- [x] 2.1 Добавить authoritative шкалу нагрева и состояние «ПЕРЕГРЕВ» в боевой HUD `App.tsx`.
- [x] 2.2 Реализовать memoized `CombatRadar` с круглым SVG clip и маркерами spaceship и enemy ships;
      ракеты, астероиды и снаряды не отображать.
- [x] 2.3 После сравнительного playtest оставить один responsive/TV-safe радар снизу по центру, не
      уменьшающий Phaser canvas и не перекрывающий HUD.

## 3. Проверка

- [x] 3.1 Добавить display component-тесты нагрева, состава маркеров, удаления entity и круглого
      clip.
- [x] 3.2 Выполнить `pnpm --filter @spaceship-defender/display test` и browser smoke на `1920×1080`,
      `1366×768`, `1024×768`.
- [x] 3.3 Выполнить `pnpm check` и `pnpm spec:validate`, затем провести read-only review.
