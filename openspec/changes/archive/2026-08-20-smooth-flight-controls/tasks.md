## 1. Protocol v6

- [x] 1.1 Повысить `PROTOCOL_VERSION` до 6 и расширить strict shield projection полями
      `energy/capacity` с cross-field invariant; проверить protocol typecheck и schemas.
- [x] 1.2 Обновить protocol tests для v5 mismatch, finite/range energy, unknown fields и одинакового
      controller/display shield shape; выполнить `pnpm --filter @town-defenders/protocol test`.

## 2. Deterministic game core

- [x] 2.1 Добавить acceleration/braking и shield capacity/drain/recharge в validated config/state.
- [x] 2.2 Реализовать vector move-towards, интеграцию по новой velocity и отмену только outward
      boundary component.
- [x] 2.3 Реализовать один queued gunner rising edge, устойчивый shield active, energy fixed-step
      drain/recharge и re-arm latch после depletion; stale aim не должен выключать shield.
- [x] 2.4 Добавить deterministic tests: 10-step acceleration, 8-step braking, diagonal/bounds,
      stale/disconnect braking, short/repeated-click coalescing, queued-fire cancel on disconnect,
      5-second drain, 10-second recharge, depletion и OFF→ON re-arm.
- [x] 2.5 Выполнить game-core tests, typecheck и build.

## 3. Authoritative room projection

- [x] 3.1 Расширить Colyseus shield state и sync полями energy/capacity; сохранить их в обеих
      StateView projections.
- [x] 3.2 Обновить shield input/neutralization: sequence idempotency, disconnect OFF, reconnect OFF,
      stale heartbeat без auto-restart.
- [x] 3.3 Добавить room tests для duplicate/out-of-order input, drain only per tick, shield OFF и
      queued-fire clear на disconnect/reconnect, depletion и совпадения public projections.
- [x] 3.4 Выполнить server tests и typecheck.

## 4. Controller gestures и shield UI

- [x] 4.1 Удалить panel-wide mouse aim; ограничить aim primary captured gesture внутри VirtualStick
      и keyboard fallback, сохранив touch tap до отправки.
- [x] 4.2 Сделать Fire hold независимым от aim и не терять rising edge короткого click до отправки;
      cancel/lost-capture/blur должны освобождать дальнейшую fire cadence.
- [x] 4.3 Перевести Shield на click/non-repeat Space toggle без release OFF, один раз отправлять OFF
      после authoritative depletion/reconnect и добавить energy meter/`aria-pressed`.
- [x] 4.4 Добавить controller tests для ordinary mousemove, stick tap/drag, short Fire click,
      release/cancel/blur, shield toggle и meter; выполнить controller tests/typecheck.

## 5. Phaser presentation и HUD

- [x] 5.1 Заменить frame-dependent LERP на elapsed-time snapshot transitions для castle, turret,
      shield и projectiles; выключить `roundPixels`.
- [x] 5.2 Перевести camera scroll на bounded visual castle position без второго frame-dependent
      follow и сбрасывать interpolation buffer при hydration/correction.
- [x] 5.3 Добавить display shield energy HUD и тесты trajectory при 60/120 Hz, bounds/hydration и
      controller/display energy equality; выполнить display tests/typecheck.

## 6. Интеграция и документация

- [x] 6.1 Обновить room adapters, fixtures, network smoke и Playwright под protocol v6, gesture-only
      aim, стабильный fire, toggle/drain/recharge shield и плавное движение.
- [x] 6.2 Обновить `docs/PROJECT_PLAN.md` и OpenSpec context: shield больше не hold и energy входит
      в текущий slice; новые dependencies не добавлять.
- [x] 6.3 Выполнить package checks, `pnpm check`, `pnpm spec:validate`, network smoke и browser E2E;
      исправить все regression.

## 7. Review и передача

- [x] 7.1 Провести read-only reviewer pass по protocol authority, energy idempotency, reconnect,
      React pointer lifecycle, Phaser interpolation и acceptance scenarios.
- [x] 7.2 Запустить server/display/controller для ручного playtest на одном компьютере; archive и
      commit выполнять только после подтверждения результата пользователем.
