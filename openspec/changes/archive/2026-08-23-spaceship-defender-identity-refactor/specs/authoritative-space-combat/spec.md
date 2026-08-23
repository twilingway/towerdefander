## RENAMED Requirements

- FROM: `### Requirement: Уничтожение замка завершает run`
- TO: `### Requirement: Уничтожение spaceship завершает run`

## MODIFIED Requirements

### Requirement: Core создаёт детерминированный combat world

Game-core SHALL создавать combat state только из validated config и явного non-zero uint32 run seed.
State SHALL хранить seed/domain RNG state, encounter phase, wave, spaceship HP, monotonic spawn
sequence, enemies, asteroids, friendly/hostile projectiles и homing missiles. Одинаковые config,
seed и ordered role inputs SHALL давать структурно одинаковые state transitions без `Math.random`,
wall clock, Phaser, DOM или network. Spawn и upgrade offers SHALL использовать независимые
deterministic streams, выведенные из run seed, wave и domain.

#### Scenario: Два run получают одинаковый seed

- **WHEN** два core instance получают одинаковые config, seed и input trace
- **THEN** на каждом fixed step их waves, entity identities, transforms, HP и results совпадают

#### Scenario: Seed некорректен

- **WHEN** run seed равен нулю, не является uint32 либо config содержит non-finite combat rate/cap
- **THEN** core отклоняет создание state без частичной симуляции

### Requirement: Пространственные угрозы имеют разные авторитетные поведения

Wave SHALL создавать `gunship`, `missileCarrier` и `asteroid`. Gunship SHALL держать configured
дистанцию до current spaceship position и стрелять одиночными linear bullets. MissileCarrier SHALL
двигаться медленнее и запускать homing missile, heading которого меняется к current spaceship
position по shortest arc не быстрее configured turn rate. Asteroid SHALL сохранять заданную seeded
velocity до collision, destruction, lifetime либо выхода за world padding. Enemy decisions SHALL
выполняться только fixed step и в стабильном spawn-sequence order.

#### Scenario: Gunship атакует

- **WHEN** gunship жив и его attack cooldown завершён
- **THEN** core создаёт один hostile bullet с stable ID и velocity в направлении spaceship position
  этого tick

#### Scenario: Ракета наводится

- **WHEN** spaceship пересекает направление летящей homing missile
- **THEN** missile поворачивает к новой позиции не быстрее max turn-rate и не прыгает сразу на
  target

#### Scenario: Астероид летит через арену

- **WHEN** asteroid не столкнулся с projectile, shield или spaceship
- **THEN** каждый fixed step изменяет его position только по сохранённой velocity

### Requirement: Collision и damage принадлежат серверной симуляции

Core SHALL проверять fast projectile/hazard movement relative swept segment-circle collision по
previous/next positions source и target. Candidates SHALL сортироваться по time-of-impact, затем
source spawn sequence и target spawn sequence. Friendly projectile SHALL повреждать первый candidate
enemy ship, asteroid или missile и удаляться после hit; hostile bullet не сбивается в первом slice.
Для hostile threat core SHALL сначала проверять active shield arc на current authoritative angle,
затем spaceship body. Все одновременные candidates SHALL разрешаться по monotonic spawn sequence.

#### Scenario: Быстрый projectile пересекает цель между ticks

- **WHEN** segment projectile пересекает enemy circle, хотя обе endpoint positions находятся вне
  circle
- **THEN** hit регистрируется один раз, enemy теряет HP и projectile удаляется

#### Scenario: Щит направлен на угрозу

- **WHEN** active shield имеет energy не меньше bullet hit cost и hostile bullet пересекает shield
  radius внутри authoritative arc
- **THEN** при energy не меньше bullet hit cost bullet удаляется, spaceship HP не меняется, shield
  energy уменьшается на hit cost и при нуле shield переходит в существующий auto-OFF/rearm state

#### Scenario: Энергии щита недостаточно

- **WHEN** active shield имеет energy меньше hit cost пересекающей его missile
- **THEN** energy становится 0, shield выключается/rearm, missile продолжает тот же sweep и может
  нанести damage spaceship

#### Scenario: Щит направлен в другую сторону

- **WHEN** та же threat пересекает spaceship снаружи shield arc
- **THEN** shield не расходует hit energy, threat удаляется и spaceship получает configured damage

#### Scenario: Пушка сбивает ракету

- **WHEN** friendly projectile swept path первым пересекает homing missile
- **THEN** обе entities удаляются без damage кораблю

#### Scenario: Астероид перехвачен щитом

- **WHEN** asteroid пересекает active shield arc при energy не меньше asteroid hit cost
- **THEN** asteroid уничтожается без bounce, spaceship HP не меняется и shield оплачивает asteroid
  hit cost

### Requirement: Combat state соблюдает жёсткие entity caps

Одна room SHALL содержать не более 40 enemy ships, 16 asteroids, 96 hostile bullets, 12 homing
missiles, 32 friendly projectiles и 196 dynamic entities суммарно. Когда type либо total cap занят,
director SHALL оставить enemy/asteroid spawn pending и SHALL NOT удалять или заменять уже
существующую entity. Подавленная cap попытка projectile fire SHALL запустить обычный cooldown без
projectile и без будущего burst. Identity SHALL оставаться уникальной на протяжении run.

#### Scenario: Missile cap заполнен

- **WHEN** carrier готов атаковать при 12 живых missiles
- **THEN** новая missile не создаётся, существующие missiles не меняют identity, cooldown
  расходуется и carrier не создаёт burst сразу после освобождения cap

#### Scenario: Total cap заполнен

- **WHEN** scheduled wave spawn довёл бы total dynamic entity count выше 196
- **THEN** spawn остаётся pending, а snapshot сохраняет максимум 196 entities

### Requirement: Уничтожение spaceship завершает run

Spaceship SHALL начинать run с configured current/max HP. Неперехваченный bullet, missile или
asteroid SHALL атомарно уменьшать HP не ниже нуля. При HP=0 encounter SHALL стать `result` с
outcome=`defeat`; core SHALL заморозить transforms, attacks, spawns, collisions и дальнейший damage,
сохраняя финальные wave, score и entities для display/reconnect.

#### Scenario: Последняя ракета попадает в spaceship

- **WHEN** unshielded missile damage не меньше оставшегося spaceship HP
- **THEN** HP становится 0, encounter становится `result`/`defeat` и следующий fixed step не создаёт
  или не двигает combat entities
