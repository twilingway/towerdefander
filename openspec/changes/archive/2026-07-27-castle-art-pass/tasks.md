## 1. Art direction and asset

- [x] 1.1 Проверить утверждённый art brief и нормализованный layout contract центрального замка,
      двух дорог и артиллерийских позиций.
- [x] 1.2 Сгенерировать, проверить и сохранить оптимизированный environment asset в display.

Verification: визуальный просмотр и layout test подтверждают anchors, отсутствие текста, врагов и
водяных знаков, `1536x864`, вес не более `2.5 MB` и размещение важных элементов в safe area.

## 2. Phaser composition

- [x] 2.1 Добавить состояния environment loader `loading | ready | failed`, немедленный code-native
      fallback и позднюю замену только environment layer.
- [x] 2.2 Перестроить левую и правую траектории врагов от краёв экрана к воротам замка.
- [x] 2.3 Согласовать башенные projectiles, подписи секторов, health и airstrike effects с новой
      композицией.
- [x] 2.4 Сохранить responsive scale и hydration-safe runtime lifecycle.

Verification: `pnpm.cmd --filter @town-defenders/display test` и ручной viewport 1280x720/1920x1080.

## 3. Verification and delivery

- [x] 3.1 Добавить тестируемую модель зеркальных lane coordinates и fallback state.
- [x] 3.2 Обновить Playwright assertions для castle art scene.
- [x] 3.3 Обновить README, выполнить `pnpm check`, reviewer pass и `pnpm spec:validate`.
- [x] 3.4 Архивировать OpenSpec change, создать Git commit и перезапустить локальный стенд.
