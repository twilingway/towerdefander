## 1. Controller controls

- [x] 1.1 Разделить левый joystick и правую круглую action-zone с независимыми pointerId и unit
      tests; проверить `pnpm --filter @spaceship-defender/controller test`.
- [x] 1.2 Реализовать landscape-first/portrait fallback CSS без перекрытия HUD и touch-зон;
      проверить controller build и viewport tests.
- [x] 1.3 Сохранить keyboard fallback и безопасную neutralization на cancel/blur/phase/reconnect.

## 2. Browser verification

- [x] 2.1 Расширить Playwright сценарием одновременного movement/aim и fire, включая shield toggle.
- [ ] 2.2 Выполнить `pnpm check`, `pnpm spec:validate` и read-only reviewer audit без
      blocker/high/medium findings.
