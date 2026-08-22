## Context

Protocol v7 уже даёт server-authoritative fixed-step 50 ms, три стабильные роли, движение замка,
пушку, directional shield с энергией, reconnect и публичный RTT. Game state пока содержит только
friendly projectiles, а server projection очищает и пересоздаёт их collection каждый tick. Для
Tyrian-inspired боя нужны сотни движущихся сущностей, deterministic randomness, collision/damage,
бесконечные waves и resource-spending upgrade commands без переноса authority в Phaser.

Подтверждённый профиль: свободная bounded-арена без vertical autoscroll, отдельный выбор улучшения
каждой роли и бесконечный run до defeat. Первый slice использует только Phaser primitives и не
добавляет production dependencies.

## Goals / Non-Goals

**Goals:**

- Создать повторяемый цикл combat → 10-second intermission → более сложный combat → defeat.
- Добавить gunship, missile carrier, asteroid, linear hostile bullet и limited-turn homing missile.
- Оставить seed, AI, transforms, collision, HP, damage, waves, offers и result на сервере/pure core.
- Дать каждой роли собственное stackable улучшение с bounded idempotency и reconnect hydration.
- Удержать worst-case fixed step в измеряемом бюджете и передавать только изменившиеся entities.
- Сохранить compact controller projection и display interpolation без client prediction hits/deaths.

**Non-Goals:**

- Vertical autoscroll, procedural map, route choice, bosses, elites и asteroid fragmentation.
- Manual restart/rematch, победа, accounts, persistence и meta-progression между комнатами.
- Bitmap art, sound, VFX assets, loot/inventory, economy shop и runtime admin panel.
- Client-authoritative physics, Phaser physics, rollback/prediction или новая dependency.

## Decisions

### 1. Room остаётся active, encounter получает отдельную phase

Protocol v8 сохраняет room phase `lobby|active`. Active game содержит `encounterPhase` со значениями
`combat|intermission|defeated`, `waveNumber`, `encounterTick` и castle HP. Это отделяет transport
lifecycle/reconnect от боевого цикла. В `defeated` snapshot остаётся наблюдаемым и reconnectable, но
core больше не двигает entities, не создаёт damage/spawns и не принимает gameplay/upgrade intents.

Альтернатива — расширить room phase — отклонена: она смешивает admission lifecycle с состоянием run
и усложняет существующие adapters/reconnect.

### 2. Pure core владеет seeded deterministic world

`createCombatConfig` содержит tuning и caps, а `createFlyingCastleState(config, runSeed)` принимает
явный non-zero uint32 seed. Core выводит независимые закреплённые uint32 RNG streams для spawn и
upgrade offers из `(runSeed,waveNumber,domain)`, поэтому изменение AI/spawn не меняет карточки той
же wave. Production server создаёт seed один раз при старте run и передаёт его core; tests
используют явные seeds. `Math.random`, wall-clock, timers и Phaser запрещены.

Каждая entity получает монотонный numeric `spawnSequence` и стабильный string ID. Все collections и
collision candidates обрабатываются по `spawnSequence`; одинаковые config, seed и ordered inputs
дают структурно одинаковый snapshot.

Альтернатива — random spawn в Room — отклонена: это ломает replayable unit tests и разделяет
authoritative rules между слоями.

### 3. Wave director использует budget и жёсткие caps

Wave 1 начинается при старте active run. Spawn plan строится детерминированно из wave number и seed:
gunship и asteroid доступны сразу, missile carrier — с wave 3. Budget, HP multiplier и attack tempo
монотонно растут; точные prototype defaults живут в validated config. Director никогда не превышает
40 ships, 16 asteroids, 96 hostile bullets, 12 missiles, 32 friendly projectiles и 196 dynamic
entities суммарно. Если enemy/asteroid cap занят, scheduled spawn остаётся pending. Если projectile
cap занят, попытка fire подавляется и всё равно запускает обычный cooldown, не создавая отложенный
burst. Core не удаляет живую entity только ради допуска новой.

Wave завершена, когда plan исчерпан и не осталось enemy ships/asteroids. Все friendly/hostile
projectiles и missiles удаляются, shield принудительно выключается, role controls neutralize, и
начинается intermission на ровно 200 fixed steps. Во время intermission transforms/collisions/fire
заморожены, shield inactive и восстанавливает energy обычной скоростью. Выборы только блокируют
cards; следующая wave всегда начинается после полного deadline с neutral controls.

### 4. Бой использует swept collision и детерминированный приоритет

Fast projectiles проверяются relative swept segment-circle по previous/next positions source и
target. Collision candidates сортируются по time-of-impact, затем source spawn sequence и target
spawn sequence, поэтому projectile поражает ближайшую допустимую цель. Для hostile threat сначала
проверяется активная shield arc на текущем authoritative angle, затем castle body. Shield при любом
остатке не гарантирует перехват: он успешен только если energy не меньше configured hit cost. При
недостатке energy щит расходует остаток, выключается/rearm и threat продолжает sweep к castle.
Asteroid при успешном shield intercept уничтожается без bounce. Неперехваченные
bullet/missile/asteroid наносят configured castle damage; при HP 0 encounter становится defeated и
оставшееся combat state замораживается.

Friendly projectile поражает первый по ordered candidates enemy ship, asteroid или missile и затем
удаляется. В первом slice friendly fire не уничтожает hostile bullets. Enemy ships не наносят
contact damage и steering не использует collision avoidance; asteroid — единственная контактная
угроза. Homing missile меняет heading к current castle position по shortest arc не быстрее
configured turn rate и удаляется по hit/lifetime/world padding.

Альтернатива — Phaser Arcade Physics — отклонена: display не должен владеть hit result, а headless
server и tests должны выполнять те же правила.

### 5. Role upgrades — absolute offer command с bounded idempotency

Intermission создаёт для каждого из трёх role slots три role-specific offers с `offerId`,
`upgradeId` и preview. Pilot получает варианты linear handling, max HP+repair; gunner — damage,
cooldown, projectile speed; shield — capacity, recharge, arc width. Modifiers принадлежат role slot
и сохраняются при reconnect/replacement.

Strict `upgrade:choose` содержит protocolVersion 8, roomId, playerId, UUID `actionId`, waveNumber,
offerId и upgradeId. Room выводит actor из connection и выполняет pipeline: strict envelope и
identity/connection authority → journal lookup/fingerprint → assigned role/intermission/current
wave/offer/selection → atomic mutation/store outcome. Journal хранит последние 32 fingerprint/
outcome на player identity и переживает reconnect; collision одного actionId с другим fingerprint
даёт `action_conflict` без mutation. Accepted duplicate молчит и остаётся видимым через
authoritative selection; rejected business duplicate повторяет прежний actor-only error. Malformed,
protocol/identity/not-controller и journal-collision errors не записываются. Evicted old command
остаётся безопасным: его immutable waveNumber/offerId уже stale и не может примениться к новой wave.
Replacement получает новый identity и не наследует journal, но наследует role modifiers/current
selection.

На deadline невыбранной role применяется первая из трёх опубликованных cards, включая disconnected
либо временно свободную role. Selection atomic: modifier и selected upgrade записываются одним
transition. Client timestamps/indices не являются authority.

### 6. Protocol v8 разделяет display и controller projections

`DisplayGameSnapshot` получает encounter summary, castle HP, stable enemies/asteroids и hostile/
friendly projectiles/missiles. `ControllerGameSnapshot` получает только encounter summary, castle
HP/shield, role modifiers, собственный current offer/selection; mass entity transforms и чужие
offers отсутствуют. Cross-field schemas проверяют unique IDs, finite bounds, HP/energy ranges,
phase-specific offer/entity invariants и caps.

Colyseus state хранит dynamic entities в keyed `MapSchema` и обновляет существующие Schema objects
на месте; удаление происходит по identity. Display adapter выдаёт arrays в стабильном
`spawnSequence` order для React/Phaser view model. Latency-only patch и unchanged entities не должны
перезапускать gameplay interpolation. Enemy spawn/death передаются state changes; optional impact
sequence может запускать только visual effect и не является source of truth.

Protocol v7 create/join/messages получают `protocol_mismatch`. Unknown fields и invalid entity/view
cross-fields отклоняются strict validation. Новых gameplay messages кроме `upgrade:choose` нет.

### 7. Reconnect и phase authorization

Существующая 30-second grace сохраняется. Combat продолжает simulation при потере controller с
trusted neutralization его continuous controls. Intermission deadline продолжает идти; reconnect
видит то же offer/selection, replacement занимает role и может выбрать за неё, если deadline ещё не
истёк. Defeated state остаётся frozen и reconnectable до display expiry/disposal. Consented leave
сохраняет существующее немедленное освобождение role.

Role inputs в intermission/defeated и upgrade command в combat/defeated возвращают actor-only
`invalid_phase` без sequence/action mutation. Display не может выбирать upgrade (`not_controller`),
а controller другой role не может выбрать чужой offer (`role_mismatch`).

### 8. Rendering и performance

Phaser создаёт primitive object один раз на entity ID, интерполирует transforms между 20-Hz
snapshots и уничтожает object при authoritative removal. Он не рассчитывает homing, collision,
damage, death или upgrade result. React HUD показывает HP, wave, phase и countdown; controllers
показывают compact combat state и только собственные cards.

Worst-case benchmark наполняет комнату caps и измеряет pure fixed-step p95 на явно записанной
reference machine; acceptance target — не более 2 ms, но это manual reference benchmark, а не
portable CI gate. Network test подтверждает отсутствие полного resend неизменившихся entity
collections. Spatial uniform grid/broad phase используется для collision candidates; determinism и
caps остаются обязательными CI invariants.

Альтернатива — отправлять полные snapshots массивами каждый tick — отклонена из-за Android TV GC,
bandwidth и Colyseus patch size.

## Risks / Trade-offs

- [Сотни Schema objects создают bandwidth/GC spikes] → stable MapSchema, in-place mutation, caps,
  patch-size assertions и Phaser object pooling/lifecycle by ID.
- [20 Hz позволяет tunneling] → swept segment-circle collision и tests для скорости выше диаметра
  цели за step.
- [Бесконечный scaling переполняет числа] → validated clamps для HP/damage/cooldown multipliers и
  safe integer wave cap с saturated difficulty после cap.
- [Один disconnect блокирует intermission] → fixed 200-tick deadline и deterministic fallback.
- [Journal бесконечно растёт] → 32 entries per identity; stale offer invariant сохраняет mutation
  safety после eviction.
- [Щит с недостаточной energy пропускает большой hit] → UI показывает authoritative energy/cost, а
  tests закрепляют collapse и продолжение sweep без partial-damage model.
- [Android TV не выдержит worst-case drawing] → primitive caps, pooling, no bitmap dependency,
  render/network profiling и возможность снизить caps отдельным accepted tuning change.

## Migration Plan

1. Ввести protocol v8 schemas/tests и сохранить явный rejection v7.
2. Расширить pure core и deterministic tests без подключения Room/display.
3. Перевести текущие projectiles и новые entities на stable keyed server state и StateView.
4. Подключить room handlers, phase/reconnect/idempotency и network tests.
5. Подключить display/controller UI, Playwright и worst-case benchmark.
6. Выполнить `pnpm check`, `pnpm spec:validate`, reviewer и manual playtest перед archive.

Rollback до archive — возврат change files/production commits обычным Git revert. Protocol v7 и v8
не смешиваются в одной room; rolling deployment требует draining старых rooms или sticky routing к
старой версии до их disposal.

## Open Questions

Нет блокирующих product decisions. Точные balance constants внутри утверждённых правил являются
обратимым prototype tuning и фиксируются config/tests до реализации core.
