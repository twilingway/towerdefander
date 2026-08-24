## Why

Controller получил landscape-first боевой layout, но на телефоне полезную площадь съедают адресная
строка и системные панели браузера. Виртуальный стик и action-zone делят остаток viewport, а
`min-height: 100vh` в базовых правилах считает высоту по развёрнутой панели, поэтому боевые зоны
сжимаются ещё до старта волны. Дополнительно pull-to-refresh перехватывает вертикальный свайп по
стику, а экран телефона гаснет у роли, которая держит устойчивый intent и долго не тапает.

## What Changes

- Controller запрашивает fullscreen и landscape orientation lock на первом пользовательском тапе
  («Подключиться» на форме входа, «Я готов» при уже открытой комнате) — без отдельной кнопки в
  боевом HUD.
- Controller удерживает screen wake lock, пока подключён к комнате, и переустанавливает его при
  возврате вкладки из фона.
- Боевая область использует полный viewport: `viewport-fit=cover`, `env(safe-area-inset-*)` в
  паддингах, `100dvh` вместо `100vh` в базовых правилах, `overscroll-behavior: none` против
  pull-to-refresh и «резинки».
- Отказ или отсутствие любого из трёх API не влияет на игровую сессию: подключение, intents и
  голосование работают ровно как сейчас.

Не входит в change: PWA-манифест и установка на домашний экран, поддержка Safari/iOS (`webkit`-
префиксные ветки не добавляются), fullscreen для `apps/display`, изменение protocol, server
authority, баланса и любых игровых правил.

## Capabilities

### New Capabilities

- `controller-immersive-viewport`: immersive-режим controller в Chrome — fullscreen, фиксация
  ориентации, wake lock и использование полной площади экрана.

## Impact

- `apps/controller`: `index.html` (`viewport-fit=cover`), новый модуль immersive-режима, вызов из
  `App.tsx` на существующих тапах, базовые правила `styles.css`, unit-тесты.
- Shared protocol, server authority и `apps/display` не меняются.
- Материальное решение о совместимости: целевой браузер — Chrome (desktop и Android). Safari
  исключён из scope сознательно; на нём отсутствующие API просто не вызываются.
