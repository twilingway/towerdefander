## Why

Текущая схема статичной tower-defense игры больше не соответствует новой продуктовой идее. Нужен
быстрый playable slice кооперативного top-down экшена, где один летающий замок в реальном времени
управляется тремя игроками с разными обязанностями.

## What Changes

- **BREAKING**: protocol повышается до v5 и заменяет sector/tower-defense snapshot моделью летающего
  замка, карты, role inputs и снарядов.
- Комната первого этапа имеет ровно три стабильные роли по порядку входа: `pilot`, `gunner`,
  `shield`; матч стартует после подключения и готовности всех трёх.
- Pilot перемещает замок по top-down карте через WASD/стрелки на компьютере или виртуальный stick на
  touch-устройстве.
- Gunner направляет башню виртуальным stick и удерживает fire; сервер по последнему принятому input
  и simulation-tick cooldown создаёт и двигает снаряды.
- Shield operator направляет и удерживает активный сектор щита вокруг замка.
- Сервер владеет position, input timeout, cooldown и fixed-step симуляцией; display только
  интерполирует snapshot.
- Phaser отображает карту, замок, башню, щит, декоративные непроходимость не создающие препятствия и
  снаряды только code-native прямоугольниками, кругами и линиями.
- Старые волны, дороги, ворота, экономика, repair/upgrade и airstrike не участвуют в новом режиме.
- Новые production dependencies, persistence и Android native output не добавляются.

## Capabilities

### New Capabilities

- `flying-castle-simulation`: детерминированное перемещение замка, направление систем, снаряды,
  границы карты и input timeout.
- `three-role-controls`: стабильные роли pilot/gunner/shield, role-authorized intents и управление
  клавиатурой/виртуальными sticks.
- `primitive-top-down-battlefield`: Phaser-сцена top-down карты с камерой и code-native primitives.

### Modified Capabilities

- `shared-room-session`: protocol v5, фиксированные три role slots, новый lifecycle и projections.
- `deterministic-defense-loop`: старый sector-defense loop заменяется flying-castle simulation.
- `visual-battlefield-rendering`: статичное поле дорог заменяется прокручиваемой top-down картой.
- `wave-campaign`: пяти-волновая кампания выводится из первого flying-castle slice.
- `shared-defense-economy`: repair/upgrade/treasury выводятся из первого flying-castle slice.
- `cooperative-airstrike`: airstrike заменяется ролью gunner и обычными снарядами.

## Impact

- Изменяются `packages/protocol`, `packages/game-core`, Colyseus room/state, display, controller,
  network smoke и browser E2E.
- Открытые protocol v4 вкладки несовместимы и получают `protocol_mismatch`;
  server/display/controller обновляются вместе.
- Коммит `00c3ab7` сохраняет предыдущий 2–6 player tower-defense этап как точку возврата.
- Следующие изменения добавят противников, столкновения/урон, генерацию карты и roguelike
  прогрессию; они не входят в этот slice.

## Initial Slice Profile

Профиль выведен непосредственно из запроса пользователя для первой стадии:

1. Ровно три игрока и три роли; роль назначается по порядку входа и сохраняется при reconnect.
2. Мир `2400×1600`, viewport `1280×720`, камера следует за замком.
3. Серверный fixed step 50 ms; controller отправляет input сразу при изменении и heartbeat каждые
   100 ms, не превышая общий server limit 20 messages/s.
4. Continuous input использует монотонный sequence; duplicate/out-of-order input игнорируется.
5. Потерянный input старше 250 ms сбрасывает движение и active shield в безопасное состояние.
6. Gunner aim/fire использует monotonic sequence; удержание fire создаёт не чаще одного снаряда за
   250 ms независимо от частоты heartbeat.
7. Враги, damage, shield energy, win/lose и процедурная карта пока отсутствуют.
