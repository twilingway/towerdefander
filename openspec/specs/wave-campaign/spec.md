# wave-campaign Specification

## Purpose

TBD - created by archiving change build-visual-wave-mvp. Update Purpose after archive.

## Requirements

### Requirement: Run выполняет бесконечные возрастающие waves

Current strict active run SHALL публиковать monotonic `waveNumber`, encounter phase и countdown.
Wave 1 SHALL начаться при старте run; gunship и asteroid доступны с wave 1, missile carrier — не
раньше wave 3. Spawn budget, enemy HP и attack tempo SHALL монотонно увеличивать либо сохранять
сложность до validated saturation limits, не уменьшая difficulty следующей wave. Run SHALL быть
бесконечным до terminal result/defeat; victory и boss wave в этом slice отсутствуют. Circular arena
boundary SHALL NOT сама уничтожать enemy ships или уменьшать remaining wave population. Ambient
asteroids SHALL существовать независимо от wave budget и SHALL NOT препятствовать intermission,
когда wave-origin population уничтожена.

#### Scenario: Первая combat wave опубликована

- **WHEN** display получает первый current-protocol active snapshot
- **THEN** snapshot содержит `waveNumber=1`, `encounterPhase=combat`, arenaRadius и authoritative
  wave state

#### Scenario: Следующая wave сложнее

- **WHEN** intermission после wave N завершается
- **THEN** начинается wave N+1 с budget/HP/attack tempo не ниже wave N и в пределах validated caps

#### Scenario: Третья wave открывает carrier

- **WHEN** director строит spawn plan для wave 3
- **THEN** plan может детерминированно содержать missileCarrier, тогда как plans waves 1–2 его не
  содержат

#### Scenario: Enemy прижат к границе

- **WHEN** живой enemy касается arena circumference во время chase/orbit
- **THEN** он остаётся частью current wave до destruction и не приближает intermission boundary

#### Scenario: Ambient asteroid летит при завершённой wave

- **WHEN** последний wave-origin target уничтожен, ambient asteroid ещё существует и spaceship
  пережил этот fixed step
- **THEN** wave завершается, ambient asteroid очищается и intermission countdown начинается

#### Scenario: Последний target и spaceship уничтожены одновременно

- **WHEN** wave-origin population закончилась на том же tick, где ambient hazard уменьшил HP до нуля
- **THEN** result/defeat имеет приоритет и intermission не начинается

### Requirement: Каждая combat wave имеет server-authoritative deadline

Server SHALL давать каждой новой combat wave конфигурируемый wall-clock deadline с default 20 минут
и допустимым диапазоном 1..86400 секунд. Server SHALL создавать новый полный deadline только при
фактическом входе в следующую combat wave. Inputs, reconnect, intermission и upgrade choice SHALL
NOT продлевать текущий deadline. Display и controllers SHALL получать одинаковый
`waveSecondsRemaining`.

#### Scenario: Первая волна получает полный срок

- **WHEN** первый run переходит из lobby в combat wave 1
- **THEN** при default config server публикует countdown 1200 секунд и запускает authoritative
  deadline этой волны

#### Scenario: Следующая волна обновляет срок

- **WHEN** intermission волны N заканчивается и начинается combat wave N+1
- **THEN** новая волна получает полный настроенный deadline независимо от длительности предыдущей
  волны

#### Scenario: Operator настраивает длительность волны

- **WHEN** server стартует с валидным `ROOM_WAVE_TTL_SECONDS` вместо default
- **THEN** каждая новая combat wave получает указанное число секунд в диапазоне 1..86400

#### Scenario: Reconnect не останавливает срок

- **WHEN** controllers отключаются и возвращаются во время combat
- **THEN** wall-clock countdown продолжает уменьшаться и reconnect получает актуальный остаток

### Requirement: Незавершённая к deadline волна заканчивает run поражением

Если wave-угрозы не уничтожены до deadline, server SHALL до следующего simulation step создать
frozen `result/defeat` с `defeatReason=wave_timeout`, сохранить фактический hull/счёт/сущности и
остановить новые spawns/damage. Уничтожение hull SHALL публиковать
`defeatReason=spaceship_destroyed`.

#### Scenario: Время волны истекло при живом корабле

- **WHEN** deadline наступил, combat wave не завершена и hull больше нуля
- **THEN** run переходит в frozen defeat с причиной `wave_timeout` без обнуления hull

#### Scenario: Последний допустимый step завершает волну

- **WHEN** последний wave target уничтожен simulation step, начавшимся до deadline
- **THEN** server переводит run в intermission и не создаёт timeout defeat

#### Scenario: Deadline наступил до следующего step

- **WHEN** server clock достиг deadline до применения очередного combat step
- **THEN** timeout result имеет приоритет, а очередные movement, spawn и damage не применяются
