# Tasks

## 1. Камера

- [x] 1.1 Центрировать камеру на интерполированной позиции без ограничения границами мира; убрать
      `setBounds` и overscan из рантайма.
- [x] 1.2 Убрать ставшие мёртвыми хелперы ограниченного скролла и overscan.
- [x] 1.3 Тесты вида: у края арены корабль остаётся в центре viewport.
      `pnpm --filter @spaceship-defender/display exec vitest run src/game/spaceshipViewModel.test.ts`

## 2. Проверка

- [x] 2.1 `pnpm check > log 2>&1; echo "EXIT:$?"` и `pnpm spec:validate`.
- [ ] 2.2 Приёмка глазами: у края арены картинка едет ровно.
