## MODIFIED Requirements

### Requirement: Run выполняет бесконечные возрастающие waves

Current strict active run SHALL публиковать monotonic `waveNumber`, encounter phase и countdown.
Wave 1 SHALL начаться при старте run. Wave campaign SHALL состоять из явной таблицы waves и
процедурного director: если `waveNumber` не превышает длину таблицы, состав волны SHALL строиться
ровно из её записей в объявленном порядке, без обращения к spawn RNG за составом; иначе состав SHALL
строиться процедурным director из spawn budget. Каждая запись таблицы SHALL задавать kind,
количество, интервал спавна внутри группы и optional сектор появления; сектор SHALL ограничивать
seeded spawn angle, но SHALL NOT делать его фиксированным. Волна таблицы SHALL мочь переопределять
множители HP и attack tempo; при отсутствии переопределения действуют формулы director. Доступность
kind SHALL определяться его configured wave разблокировки, а стоимость в budget — его configured
spawn cost; оба SHALL быть данными конфигурации, а не литералами кода. Для волн, которые строит
director, spawn budget, enemy HP и attack tempo SHALL монотонно увеличивать либо сохранять сложность
до validated saturation limits, не уменьшая difficulty следующей wave; для явных волн авторитетна
таблица как она задана. Run SHALL быть бесконечным до terminal result/defeat; victory в этом slice
отсутствует. Kind с политикой появления «boss» SHALL замыкать план волны, SHALL NOT участвовать в
перемешивании состава и SHALL появляться только после уничтожения всех остальных wave-угроз; ambient
asteroids SHALL NOT задерживать его появление. Пока такой kind остаётся в очереди спавна, волна
SHALL NOT завершаться. Circular arena boundary SHALL NOT сама уничтожать enemy ships или уменьшать
remaining wave population. Ambient asteroids SHALL существовать независимо от wave budget и SHALL
NOT препятствовать intermission, когда wave-origin population уничтожена.

#### Scenario: Первая combat wave опубликована

- **WHEN** display получает первый current-protocol active snapshot
- **THEN** snapshot содержит `waveNumber=1`, `encounterPhase=combat`, arenaRadius и authoritative
  wave state

#### Scenario: Следующая процедурная wave сложнее

- **WHEN** intermission после wave N завершается и обе волны строит director
- **THEN** начинается wave N+1 с budget/HP/attack tempo не ниже wave N и в пределах validated caps

#### Scenario: Явная волна воспроизводится как задана

- **WHEN** таблица задаёт волне состав из трёх `interceptor` и одного `gunship`
- **THEN** wave содержит ровно этот состав и это количество, независимо от run seed

#### Scenario: Wave за пределами таблицы строит director

- **WHEN** `waveNumber` превышает длину таблицы явных волн
- **THEN** состав строится процедурно из spawn budget, а seeded план воспроизводим из
  `(runSeed, waveNumber)`

#### Scenario: Kind разблокируется настроенной волной

- **WHEN** director строит spawn plan для волны раньше configured волны разблокировки некоторого
  kind
- **THEN** plan не содержит этот kind, а начиная с настроенной волны может его содержать

#### Scenario: Босс замыкает план волны

- **WHEN** director строит план для волны, выбранной интервалом босс-волн
- **THEN** kind с политикой «boss» стоит последним в плане независимо от run seed

#### Scenario: Босс ждёт зачистки волны

- **WHEN** боссу настала очередь спавна, но хотя бы одна wave-угроза ещё жива
- **THEN** боссa на арене нет, он остаётся в очереди, а волна не переходит в intermission

#### Scenario: Босс выходит после последней цели

- **WHEN** последняя wave-угроза уничтожена и на арене остаются только ambient asteroids
- **THEN** босс появляется на ближайших fixed steps и волна продолжается до его уничтожения

#### Scenario: Сектор ограничивает точку появления

- **WHEN** запись явной волны задаёт сектор появления
- **THEN** все её spawns появляются внутри этого сектора arena circumference, оставаясь seeded и
  воспроизводимыми

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
