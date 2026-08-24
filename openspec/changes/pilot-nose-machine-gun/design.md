## Context

Корабль сейчас не имеет направления «нос»: корпус рисуется кругом, движение задаётся вектором
пилота, а единственный friendly weapon — вращающаяся пушка gunner'а (`turretAngle` + queued fire).
Протокол v11: `pilot:input` содержит только movement vector; sequence watermark ведётся на message
type; strict schemas отклоняют неизвестные/отсутствующие поля. Server room уже реализует
neutralization paths (stale input в core, disconnect через `cancelGunnerControl`/
`cancelShieldControl`, combat→intermission через `neutralizeAllRoles`).

Запрошено: второй контрол у пилота — hold-спуск носового пулемёта с перегревом; нос поворачивается
туда, куда нажат левый (movement) стик. Подтверждено владельцем продукта: быстрый и слабый MG (~100
ms / ~8 урона), upgrade cards для MG не входят в change.

## Goals / Non-Goals

**Goals:**

- Trusted heading корабля как часть deterministic simulation, публикуемый display/controller.
- Носовой пулемёт: hold-fire с authoritative cooldown, queued rising edge, spawn строго из носа,
  модель heat/overheat/rearm — всё в pure game-core.
- Protocol v12 со строгими schemas и существующим mismatch-поведением.
- Controller пилота: правая fire-зона + Space, шкала перегрева из authoritative snapshot.
- Display: читаемый нос (маркер/ствол) и отличимые снаряды MG.

**Non-Goals:**

- Upgrade cards/economy для MG (отдельный change).
- Отдельный message type или отдельная sequence stream для MG.
- Изменение поведения пушки gunner'а, shield и movement.
- True 3D, новые enemy archetypes, persistent state.

## Decisions

### D1. Нос = trusted heading, следующий за movement input

Ненулевой свежий movement vector задаёт target heading; нулевой — latched (как gunner aim). Traverse
по shortest arc/no overshoot через существующий `advanceAngularTraverse` с rates ровно вдвое быстрее
turret (`13π/15`, `26π/15`, `13π/5`). Initial heading 0.

- Альтернатива «нос = направление velocity»: отклонена — при остановке нос неопределён, а пилот
  теряет явное управление направлением огня; поведение зависело бы от инерции.
- Альтернатива «второй стик — независимый aim пулемёта» (twin-stick): отклонена по решению владельца
  — правый контрол чистый спуск, прицел = направление движения.

### D2. Правый контрол — hold-спуск без aim

`mgFiring: boolean` внутри того же `pilot:input`. Pointerdown в fire-зоне / non-repeat keydown Space
→ true; pointerup/cancel/lost capture / keyup → false. Desktop Space у пилота свободен (у gunner и
shield он уже используется на их панелях).

- Альтернатива «отдельный message `pilot:machine-gun`»: отклонена — потребовала бы вторую sequence
  stream, второй watermark и синхронизацию двух потоков при одном источнике ввода; один поток
  сохраняет существующие правила ordering/duplicate без изменений.

### D3. Перегрев: heat per shot + cooling на тиках без выстрела + гистерезис

Каждый spawned снаряд: `heat += 4` (clamp 100). Тик без снаряда: `heat -= 30 * dt` (clamp 0).
`overheated` latch при heat >= capacity; снятие только при heat <= 30. При удержанном
`mgFiring=true` огонь возобновляется автоматически после rearm — спуск остаётся absolute desired
state, как gunner firing и shield active.

- Альтернатива «ручной rearm по образцу shield depletion» (controller сбрасывает local desired при
  перегреве): отклонена — добавляет синхронизацию состояния в controller без выигрыша; heat здесь
  rate limiter, а не расходный ресурс.
- Альтернатива «непрерывный drain во время огня»: отклонена — сложнее предсказать длительность
  непрерывного огня; per-shot модель детерминирована и тривиально тестируема (25 снарядов =
  перегрев).

Дефолты: cooldown 100 ms, damage 8, speed 900, radius 5, heat/shot 4, cooling 30/s, rearm 30 — все в
config с validation; тюнинг без изменения контракта.

### D4. Protocol v12 (breaking)

- `pilotInputCommandSchema`: + обязательный `mgFiring` → old clients получают существующий
  `protocol_mismatch`; поведение mismatch не меняется.
- `publicSpaceshipViewSchema`: + `heading`.
- Новый machineGun view `{heat, capacity, overheated}` в game snapshot (controller и display).
- `publicProjectileViewSchema`: + опциональный `source: "cannon" | "machineGun"` — только у
  friendly; hostile без поля. Опциональное поле сохраняет strict schema и не обязывает заполнять
  значение для чужих снарядов.

### D5. Fire pipeline MG зеркалит пушку

Rising edge → один queued request (coalesce); consume на eligible tick по current heading; spawn у
носа `center + headingDir * (spaceshipRadius + mgProjectileRadius)`; cap-подавление consumed
request + перезапуск cooldown без burst (поведение существующей пушки). Снаряды — `friendly`, общие
caps 32/196.

### D6. Neutralization через trusted core transitions

Stale pilot input: movement zero + `mgFiring=false` + отмена heading target (current angle и heat
сохраняются, heat остывает). Disconnect: `cancelPilotMgControl`-подобный transition — queued MG fire
очистить, mgFiring false, heading target null. Intermission: та же neutralization в
`neutralizeAllRoles`; heat продолжает остывать (MG «остывает между волнами»). Reconnect: mgFiring
false, targets не восстанавливаются — по образцу gunner/shield.

### D7. Controller и display

Controller: `ControlState` расширяется полем `mgFiring` (для не-pilot ролей всегда false); тот же
`LatestInputScheduler` → bandwidth без изменений (<=20 msg/s). Шкала перегрева читает только
authoritative machineGun view; локальное моделирование heat запрещено. Display: heading через angle
transition (как turret), носовой маркер/ствол на корпусе, цвет снарядов по `source` с fallback на
radius-размер.

## Risks / Trade-offs

- [Баланс] эффективный DPS MG (~42 в цикле 2.5 s огонь / ~2.3 s остывание) ниже пушки (100), но даёт
  пилоту автономный огонь → числа в config, тюнинг без изменения контракта; upgrade cards —
  отдельный change.
- [Хрупкие константы] точное число fixed steps для 180° traverse не зафиксировано в specs
  (дискретная динамика) → сценарии проверяют no-overshoot, max speed и latched target; rates
  зафиксированы в config requirement.
- [Breaking protocol v12] v11 clients отклоняются на join/input → деплой атомарный (один
  репозиторий, один build); mismatch-поведение уже покрыто тестами.
- [Android TV display] дополнительный вращающийся маркер и цвет снарядов — пренебрежимо для
  существующего Phaser budget; fallback без `source` сохраняет читаемость по размеру.
- [Auto-resume после перегрева] игрок, удерживающий спуск, получает циклы огонь/пауза → gauge и
  overheat-состояние кнопки делают цикл предсказуемым; при негативном фидбеке меняется только
  config/UX, контракт absolute desired state сохраняется.

## Migration Plan

1. Protocol v12 + game-core + server + controller + display одним атомарным деплоем (единый build).
2. Старые вкладки с v11 получают `protocol_mismatch` при join/input — существующий UX «Обновите
   страницу».
3. Rollback: откат кода на v11; persistent state не затрагивается (room state in-memory per run,
   новых persisted полей нет).

## Open Questions

Нет блокирующих: все материальные решения подтверждены владельцем продукта. Дефолтные числа MG/heat
зафиксированы в specs как config и могут тюнинговаться без изменения контракта.
