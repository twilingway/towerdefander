## Context

Protocol v6 передаёт gunner/shield aim как абсолютный vector, а game-core сейчас превращает свежий
ненулевой vector прямо в public angle на следующем fixed step. Phaser интерполирует snapshots, но не
может скрыть мгновенную authoritative смену направления и не должен изобретать физику. Короткий tap
уже отправляет ненулевой aim перед transport-neutral zero, поэтому новая модель обязана хранить
целевое направление отдельно от текущего угла.

## Goals / Non-Goals

**Goals:**

- серверный deterministic traverse turret и shield с acceleration, braking и max angular speed;
- кратчайшая дуга, детерминированная граница ±π и отсутствие overshoot;
- сохранение текущих touch/mouse/keyboard gestures и protocol v6;
- корректные tap, stale, disconnect, reconnect, fire и inactive shield semantics;
- одинаковая визуальная angular trajectory при разных render FPS.

**Non-Goals:**

- relative traverse, где x стика непосредственно задаёт clockwise/counter-clockwise velocity;
- масштабирование angular speed по величине vector, controller-side prediction/compass;
- enemies, hit detection, shield collision, upgrades, art и новые dependencies.

## Decisions

### Absolute bearing остаётся intent, traverse принадлежит game-core

Ненулевой aim задаёт target angle через `atan2`; magnitude после нормализации не влияет на скорость.
Transport zero сохраняет target, поэтому короткий tap завершает поворот. Альтернатива relative
left/right steering отклонена: она меняет выученный UX, keyboard semantics и потребовала бы
отдельного продуктового согласования.

### Config и внутреннее состояние

`FlyingCastleConfig` получает после первого playtest тяжёлый профиль: turret max speed `π/3 rad/s`,
acceleration `2π/3 rad/s²`, braking `π rad/s²`; shield max speed `5π/12 rad/s`, acceleration
`5π/6 rad/s²`, braking `5π/4 rad/s²`. Раздельное более сильное braking сохраняет мягкую остановку
без долгого перелёта инерции. State хранит для обеих систем public current angle, internal nullable
target angle и signed angular velocity. Начальное состояние: current angle 0, target `null`,
velocity 0. Target/velocity не публикуются и не добавляются в protocol.

### Fixed-step алгоритм без overshoot

На каждом 50 ms step ядро:

1. канонизирует angles в `[-π, π)`;
2. вычисляет signed shortest delta в `(-π, π]`; точное antipode `π` всегда выбирает положительное
   экранное clockwise-направление;
3. ограничивает желаемую скорость значением `min(maxSpeed, sqrt(2 * braking * abs(delta)))` со
   знаком delta;
4. приближает angular velocity к желаемой, применяя acceleration при разгоне и braking при
   торможении/реверсе;
5. интегрирует angle и при последнем шаге прижимает его к target без перелёта, обнуляя velocity.

Pure helpers не используют wall clock, DOM, Phaser или networking. Projectile spawn берёт current
`turretAngle` на eligible authoritative tick; target angle никогда не участвует в выстреле.

### Zero, stale, disconnect и reconnect различаются

Accepted zero aim означает «стик отпущен» и не отменяет target. При age >=250 ms core очищает target
и тормозит angular velocity. Room при trusted disconnect немедленно вызывает core cancellation для
назначенной role; gunner одновременно прекращает firing/queued fire, shield выключается, но energy
не меняется до следующего tick. После reconnect sequence watermark сбрасывается, а старая target не
восстанавливается. Shield может получать target и вращаться при `active=false` или recharge.

### Rendering остаётся непривилегированным

Phaser интерполирует соседние current angles за 50 ms через shortest arc, включая wrap через ±π.
Hydration снапает к текущему authoritative angle. React controller не рассчитывает и не
предсказывает trusted angle. Protocol остаётся v6, поскольку transport и public view shape полностью
совместимы.

## Risks / Trade-offs

- [Тяжёлые rates ощущаются слишком медленно или быстро] → rates находятся в config и проверяются
  повторным ручным playtest без изменения wire contract; предыдущий быстрый профиль сохранён в Git
  commit `9998946`.
- [Discrete braking даёт микроскачок у target] → stopping-distance cap, no-overshoot clamp и
  deterministic trace tests.
- [Разные wrap conventions дают длинный визуальный путь] → общий shortest-delta contract и tests для
  `π`, `-π` и 60/120 Hz.
- [Stale packet внезапно отменяет длинный tap traverse] → heartbeat остаётся 100 ms; отмена ровно на
  пятом simulation tick проверяется core/room tests.
- [Дополнительная математика на Android TV] → постоянное число scalar операций на tick и отсутствие
  новых объектов/physics bodies в Phaser; влияние пренебрежимо относительно render cost.

## Migration Plan

1. Добавить и протестировать core config/state/helpers.
2. Подключить trusted room cancellation без изменения protocol v6 schemas.
3. Добавить display/controller/room/E2E regressions и ручную настройку rates.
4. Rollback выполняется возвратом feature commit: public wire и persisted data не мигрируются.

## Open Questions

Нет блокирующих вопросов. Relative traverse остаётся возможным отдельным change, если playtest
покажет, что absolute target bearing не соответствует ожидаемому «танковому» ощущению.
