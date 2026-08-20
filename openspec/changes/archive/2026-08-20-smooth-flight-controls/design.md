## Context

Protocol v5 и первый primitive slice доказали end-to-end управление, но непосредственное присвоение
pilot velocity создаёт мгновенный старт/стоп, а Phaser дополнительно применяет frame-dependent LERP
и `roundPixels`, поэтому движение выглядит ступенчатым. Gunner panel сейчас отслеживает mousemove
всей области и превращает координату клика по Fire в aim. Shield `active` повторяет hold-состояние и
не имеет ресурса.

Изменение пересекает protocol, deterministic core, Colyseus projection, React input lifecycle и
Phaser presentation. Server остаётся единственным владельцем position, velocity, shield energy и
projectile cadence.

## Goals / Non-Goals

**Goals:**

- Плавный server-authoritative разгон и торможение с одинаковым результатом на каждом fixed step.
- Frame-rate-independent presentation без trusted client physics.
- Aim только от явного жеста внутри virtual stick или keyboard fallback.
- Надёжный hold-fire, включая короткий click, не влияющий на aim.
- Ручной toggle-щит с capacity/drain/recharge и защитой от auto-reactivation после разряда.

**Non-Goals:**

- Shield collision/damage, enemies, upgrades UI/economy, persistence и новые art assets.
- Client prediction, изменение server tick 50 ms или новая production dependency.

## Decisions

### 1. Protocol v6 и абсолютный shield active

`PROTOCOL_VERSION` повышается до 6. Pilot и gunner envelopes сохраняют shape. Shield input сохраняет
strict shape `{sequence, aim, active}`, но `active` становится абсолютным устойчивым desired state.
Public shield projection становится `{angle, active, energy, capacity}`; обе проекции проверяют
`0 <= energy <= capacity`.

Отдельный toggle command и action journal отклонены. Handler shield input не списывает ресурс: он
только заменяет latest desired state после sequence validation. Единственное списание выполняет
authoritative fixed-step ровно один раз, поэтому duplicate/out-of-order packet не может умножить
расход и absolute state остаётся идемпотентным. Это также сохраняет единый continuous budget до 20
messages/s и не создаёт неограниченный journal. Этот message классифицируется как non-spending
desired-state setter: он не выполняет атомарное списание и потому не использует `actionId`. При
disconnect server сначала применяет OFF, затем на reconnect сбрасывает transport sequence watermark;
старый connection больше не может доставить packet, а новый controller начинает с authoritative OFF.

### 2. Движение через target velocity

Config получает `castleAccelerationPerSecondSquared=640` и `castleBrakingPerSecondSquared=800`;
maxSpeed остаётся 320. На каждом 50 ms step ядро вычисляет
`targetVelocity = normalize(input) * maxSpeed` и приближает текущий vector к target на величину не
больше `acceleration * dt`. Для zero/stale target применяется `braking * dt`. Position интегрируется
по новой velocity. Это даёт 500 ms разгона и 400 ms торможения.

При world clamp обнуляется только компонента, направленная за соответствующую границу. Сброс input
при disconnect означает target zero, но не телепортирует velocity в zero.

Альтернатива client easing отклонена: она скрыла бы рывок только на display и дала бы разное
ощущение скорости у controllers/display.

### 3. Shield energy и re-arm latch

Config получает capacity 100, drain 20 units/s и recharge 10 units/s. State начинается с полной
energy. Active step уменьшает energy; inactive step восстанавливает её; оба используют fixed dt и
clamp. При zero actual active становится false и `shieldRearmRequired=true`. Последующие heartbeat с
прежним true не включают щит. Принятый false очищает latch; последующий false→true при energy>0
включает щит.

Pointer release, blur и visibilitychange не меняют ручной shield state. Реальный disconnect server
немедленно применяет OFF; reconnect начинается OFF с текущей восстанавливающейся energy. Stale aim
сохраняет angle и не выключает щит.

Upgrade seam ограничен config fields capacity/drain/recharge; storage, prices и upgrade commands не
вводятся.

### 4. Gesture boundary и стабильный fire

Panel-wide `onPointerMove` удаляется. `VirtualStick` начинает gesture только на primary
`pointerdown`, захватывает pointer и принимает move только для captured ID. Pilot release отправляет
zero. Gunner/shield release центрирует knob, но не перезаписывает последний aim раньше, чем
ненулевой tap/drag был отправлен; core в любом случае сохраняет последний angle.

Fire button не участвует в aim. Pointerdown/Space задаёт firing=true; pointerup задаёт false. Первый
принятый server rising edge при пустой queue ставит в core boolean `queuedFire`; следующий eligible
cooldown tick создаёт ровно один projectile и очищает queue. Дополнительные clicks до consume
coalesce в тот же pending bit. Поэтому true и false между ticks не теряют первый короткий click, но
не создают unbounded очередь; hold после consume продолжает cadence. Duplicate sequence не создаёт
edge. Pointercancel, lost capture, blur и visibilitychange освобождают hold; уже принятый edge может
дать один projectile. Disconnect server очищает `queuedFire`, reconnect начинает без отложенного
выстрела. Cooldown и projectiles принадлежат core.

Shield button использует click/non-repeat Space, `aria-pressed` и authoritative energy meter.
Released pointer не меняет state. Когда snapshot сообщает auto-OFF при energy=0, controller один раз
синхронизирует local desired OFF и отправляет `active=false`, очищая authoritative re-arm latch. До
energy>0 button показывает восстановление; следующий tap отправляет новый true.

### 5. Time-based snapshot presentation

При каждом snapshot runtime запоминает текущий visual transform как source, новый authoritative
transform как target и receive timestamp. Render `update` вычисляет alpha по elapsed/50 ms и
интерполирует position/shortest angles; результат поэтому зависит от времени, а не количества
frames. Projectile visuals используют тот же source/target подход. New/hydrated objects начинают с
authoritative coordinates; все обычные corrections интерполируются за 50 ms без threshold snap.
Чистые interpolation helpers SHALL совпадать для одинакового elapsed time при разных render rates с
tolerance 0.01 world unit.

`roundPixels` выключается. Camera получает bounded scroll от уже сглаженной castle position без
дополнительного frame-dependent follow coefficient. Client не экстраполирует trusted outcome и
никогда не записывает результаты обратно в room state.

### 6. React boundaries

Высокочастотные pointer values остаются в refs/scheduler и не вызывают render всего приложения;
render state используется только для knob, authoritative shield meter и labels. Event listeners
создаются один раз на role generation и снимаются симметрично. Phaser остаётся lazy-loaded внутри
display; React владеет HUD.

## Risks / Trade-offs

- [50 ms presentation delay заметен на большом экране] → мягкая server velocity и стабильная
  trajectory важнее минимального визуального lead; prediction остаётся возможным отдельным change.
- [Queued Fire может прозвучать после release с задержкой до cooldown] → queue содержит максимум
  один rising edge и гарантирует ожидаемый выстрел; release прекращает дальнейшую hold-cadence.
- [Float energy накапливает погрешность] → fixed dt, clamp и tolerance assertions; публичные числа
  остаются finite.
- [Android TV может работать на 30 Hz] → elapsed-based interpolation даёт ту же trajectory, Phaser
  primitives и отсутствие pixel rounding не требуют дополнительных assets.
- [Protocol v5 клиенты перестанут входить] → server возвращает `protocol_mismatch`; display и
  controller деплоятся совместно.

## Migration Plan

1. Обновить protocol schemas/tests до v6.
2. Обновить core config/state/transitions и deterministic traces.
3. Обновить server schema/projection/neutralization.
4. Перевести controllers и display, затем network/E2E fixtures.
5. Обновить project plan, выполнить full checks и ручной playtest.

Rollback: вернуть единый Git commit предыдущего v5 slice; mixed v5/v6 room не поддерживается.

## Open Questions

Нет блокирующих вопросов. Acceleration, braking, drain и recharge являются prototype tuning и могут
быть изменены отдельным балансным change после playtest.
