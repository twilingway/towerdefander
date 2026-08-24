## 1. Preview controller

- [x] 1.1 Добавить `apps/controller/src/previewMode.ts`: dev-gate по `?preview=1` и фикстуры
      `ControllerRoomView` для комбинаций роли и фазы; покрыть тестом, парсящим каждую фикстуру
      `controllerRoomViewSchema`; проверить
      `pnpm --filter @spaceship-defender/controller exec vitest run src/previewMode.test.ts`.
- [x] 1.2 Включить preview-ветку в `ControllerApp`: рендер игрового экрана из фикстуры без создания
      клиента и без записи `roomReference`; проверить рендер-тестом на `renderToStaticMarkup` и
      `pnpm --filter @spaceship-defender/controller typecheck`.
- [x] 1.3 Добавить панель переключения роли и фазы, перерисовывающую экран без перезагрузки;
      проверить `pnpm --filter @spaceship-defender/controller test`.

## 2. Preview display

- [x] 2.1 Добавить `apps/display/src/previewMode.ts` с тем же gate и фикстурами `DisplayRoomView`;
      покрыть тестом на `displayRoomViewSchema`; проверить
      `pnpm --filter @spaceship-defender/display exec vitest run src/previewMode.test.ts`.
- [x] 2.2 Включить preview-ветку в `DisplayApp` со статичным снапшотом для `SpaceshipCanvas` и
      панелью переключения фаз; проверить `pnpm --filter @spaceship-defender/display test` и
      `pnpm --filter @spaceship-defender/display build`.

## 3. Верификация

- [x] 3.1 Подтвердить, что production-сборка обеих апп игнорирует `?preview=1` (гейт
      `import.meta.env.DEV`), и зафиксировать, что код фикстур при этом остаётся в бандле.
- [x] 3.2 Выполнить `pnpm check` и `pnpm spec:validate`.
- [ ] 3.3 Выполнить read-only reviewer audit без blocker/high/medium findings.
