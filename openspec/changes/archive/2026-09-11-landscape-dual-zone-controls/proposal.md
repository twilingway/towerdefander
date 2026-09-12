## Why

Текущий controller рассчитан прежде всего на вертикальную карточку и разделяет стик и прямоугольную
кнопку действия. На телефоне в landscape это расходует полезную площадь и не гарантирует
одновременное управление двумя пальцами.

## What Changes

- Controller получает landscape-first боевой layout на весь доступный viewport: левый круглый
  joystick и правая круглая action-zone.
- Левый joystick сохраняет роль-зависимое назначение: движение корабля, направление пушки либо
  направление щита.
- Правая action-zone удерживает огонь pilot/gunner; для shield одиночное нажатие переключает
  устойчивый ON/OFF intent без выключения при отпускании.
- Разные pointerId управляют зонами одновременно; cancel, blur, скрытие страницы и смена phase
  безопасно нейтрализуют непрерывные intents.
- Keyboard/mouse и portrait fallback сохраняются. Новые runtime dependencies не добавляются.

Не входит в change: новая способность щита, изменение скоростей/урона, true gamepad API и
принудительная блокировка ориентации устройства.

## Capabilities

### New Capabilities

- `landscape-controller-layout`: responsive landscape-first размещение двух независимых touch-зон.

### Modified Capabilities

- `three-role-controls`: мультитач-контракт левого joystick и правой role-specific action-zone.

## Impact

- `apps/controller`: React controls, pointer lifecycle, CSS и тесты.
- `tests/e2e`: одновременный movement/aim + action на реальных browser controllers.
- Shared protocol и server authority не меняются: controller продолжает отправлять существующие
  intents protocol v13.
