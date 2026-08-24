## 1. Immersive-режим controller

- [x] 1.1 Добавить `apps/controller/src/immersiveMode.ts` с инжектируемым host: запрос fullscreen +
      landscape orientation lock, поглощение отказа и отсутствия API; покрыть unit-тестами ветки
      «API нет», «API отказал», «уже в fullscreen»; проверить
      `pnpm --filter @spaceship-defender/controller exec vitest run src/immersiveMode.test.ts`.
- [x] 1.2 Вызвать immersive-запрос из обработчиков «Подключиться» и «Я готов» в `App.tsx`, не
      задерживая отправку команды и не заполняя поле ошибки; проверить
      `pnpm --filter @spaceship-defender/controller typecheck`.
- [x] 1.3 Реализовать screen wake lock на время подключения к комнате с повторным запросом на
      `visibilitychange` и освобождением при выходе и размонтировании; покрыть unit-тестами
      lifecycle и отсутствие API; проверить `pnpm --filter @spaceship-defender/controller test`.

## 2. Полная площадь экрана

- [x] 2.1 Добавить `viewport-fit=cover` в `apps/controller/index.html` и `env(safe-area-inset-*)` в
      паддинги оболочки, чтобы боевые зоны не попадали под вырез; проверить
      `pnpm --filter @spaceship-defender/controller build`.
- [x] 2.2 Заменить `100vh` на `100dvh` в базовых правилах `styles.css` и запретить overscroll на
      оболочке контроллера, сохранив прокручиваемый portrait fallback; проверить
      `pnpm exec prettier --check apps/controller/src/styles.css` и controller build.

## 3. Верификация

- [x] 3.1 Выполнить `pnpm check` и `pnpm spec:validate`.
- [ ] 3.2 Выполнить read-only reviewer audit без blocker/high/medium findings.
