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
