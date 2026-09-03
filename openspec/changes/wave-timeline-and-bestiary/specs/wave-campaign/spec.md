## MODIFIED Requirements

### Requirement: Run выполняет бесконечные возрастающие waves

Current strict active run SHALL публиковать monotonic `waveNumber`, encounter phase и countdown.
Wave 1 SHALL начаться при старте run. Пресет SHALL описывать тридцать прописанных волн, и каждая
пятая из них (5, 10, 15, 20, 25, 30) SHALL содержать архетип с политикой босса. За пределами таблицы
run SHALL продолжаться сгенерированными волнами и SHALL оставаться бесконечным до terminal
result/defeat. Spawn budget, enemy HP и attack tempo SHALL монотонно увеличивать либо сохранять
сложность до validated saturation limits, не уменьшая difficulty следующей wave.

Архетипы SHALL открываться по волнам, а не быть доступными все сразу: `unlockWave` SHALL держать
ранние волны на узком наборе видов. Здоровье обычного архетипа SHALL требовать более одного
попадания основного орудия корабля, чтобы бой строился на удержании цели, а не на одном нажатии.

Circular arena boundary SHALL NOT сама уничтожать enemy ships или уменьшать remaining wave
population. Ambient asteroids SHALL существовать независимо от wave budget и SHALL NOT
препятствовать intermission, когда wave-origin population уничтожена.

#### Scenario: Первая combat wave опубликована

- **WHEN** display получает первый current-protocol active snapshot
- **THEN** snapshot содержит `waveNumber=1`, `encounterPhase=combat`, arenaRadius и authoritative
  wave state

#### Scenario: Следующая wave сложнее

- **WHEN** intermission после wave N завершается
- **THEN** начинается wave N+1 с budget/HP/attack tempo не ниже wave N и в пределах validated caps

#### Scenario: Каждая пятая волна приносит босса

- **WHEN** экипаж доходит до волны 5, 10, 15, 20, 25 или 30
- **THEN** в составе волны есть архетип с политикой босса, и он появляется после зачистки остальных

#### Scenario: Ранняя волна не знает поздних видов

- **WHEN** строится план волны 1
- **THEN** в нём нет архетипов, чей `unlockWave` больше единицы

#### Scenario: За таблицей run продолжается

- **WHEN** экипаж пережил тридцатую волну
- **THEN** тридцать первая собирается директором и run продолжается без victory

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
