# authoritative-space-combat Specification

## Purpose

TBD - created by archiving change tyrian-combat-roguelite-slice. Update Purpose after archive.

## Requirements

### Requirement: Core создаёт детерминированный combat world

Game-core SHALL создавать combat state только из validated circular arena config и явного non-zero
uint32 run seed. State SHALL хранить seed/domain RNG state, encounter phase, wave, spaceship HP,
monotonic spawn sequence, enemies, asteroids, friendly/hostile projectiles и homing missiles.
Одинаковые config, seed и ordered role inputs SHALL давать структурно одинаковые circular spawn
angles и state transitions без `Math.random`, wall clock, Phaser, DOM или network. Spawn и upgrade
offers SHALL использовать независимые deterministic streams, выведенные из run seed, wave и domain.

#### Scenario: Два run получают одинаковый seed

- **WHEN** два core instance получают одинаковые config, seed и input trace
- **THEN** на каждом fixed step их waves, spawn angles, entity identities, transforms, HP и results
  совпадают

#### Scenario: Seed некорректен

- **WHEN** run seed равен нулю, не является uint32 либо config содержит противоречивую arena
  geometry/non-finite combat rate/cap
- **THEN** core отклоняет создание state без частичной симуляции

### Requirement: Пространственные угрозы имеют разные авторитетные поведения

Wave SHALL создавать `gunship`, `missileCarrier` и `asteroid`. Gunship SHALL держать configured
дистанцию до current spaceship position и стрелять одиночными linear bullets. MissileCarrier SHALL
двигаться медленнее и запускать homing missile, heading которого меняется к current spaceship
position по shortest arc не быстрее configured turn rate. Enemy ships SHALL spawn-иться полностью
внутри seeded point на arena circumference, SHALL оставаться внутри circle при chase/retreat/orbit и
SHALL NOT удаляться boundary cleanup. Wave-origin и independent ambient asteroids SHALL spawn-иться
на perimeter с seeded inward velocity и сохранять её до collision, destruction, lifetime либо выхода
за circular padding. Ambient asteroids SHALL генерироваться каждые 40–100 combat ticks из отдельного
RNG domain и SHALL NOT входить в remaining wave population. Enemy decisions SHALL выполняться только
fixed step и в стабильном spawn-sequence order.

#### Scenario: Gunship атакует

- **WHEN** gunship жив и его attack cooldown завершён
- **THEN** core создаёт один hostile bullet с stable ID и velocity в направлении spaceship position
  этого tick

#### Scenario: Enemy отступает у края

- **WHEN** preferred-distance AI задаёт outward velocity у arena circumference
- **THEN** enemy остаётся полностью внутри, сохраняет tangent и не исчезает из wave без destruction

#### Scenario: Ракета наводится

- **WHEN** spaceship пересекает направление летящей homing missile
- **THEN** missile поворачивает к новой позиции не быстрее max turn-rate и не прыгает сразу на
  target

#### Scenario: Астероид летит через арену

- **WHEN** asteroid не столкнулся с projectile, shield или spaceship
- **THEN** каждый fixed step изменяет его position только по сохранённой velocity, а после circular
  padded envelope/lifetime он удаляется

#### Scenario: Combat создаёт ambient hazards

- **WHEN** combat остаётся active и asteroid/global caps допускают spawn
- **THEN** отдельный scheduler детерминированно создаёт следующий ambient asteroid с новой
  entry/exit trajectory, не изменяя wave spawn и offer RNG streams

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

### Requirement: Носовые снаряды подчиняются общим правилам friendly projectiles

Снаряды носового пулемёта SHALL быть projectiles вида `friendly` со стабильной identity и monotonic
spawn sequence. Они SHALL участвовать в swept collision, damage, перехвате homing missiles и entity
caps на равных с снарядами пушки: 32 friendly projectile cap и 196 dynamic entities cap являются
общими для обоих оружий. Подавленная cap попытка MG fire SHALL очистить pending request и запустить
обычный MG cooldown без projectile и без будущего burst, как и подавленная попытка пушки.

#### Scenario: Носовой снаряд поражает цель

- **WHEN** swept path MG снаряда первым пересекает gunship либо asteroid
- **THEN** target теряет HP равный configured MG damage (8), снаряд удаляется — ровно по тем же
  правилам, что и снаряд пушки

#### Scenario: Носовой снаряд сбивает ракету

- **WHEN** swept path MG снаряда первым пересекает homing missile
- **THEN** обе entities удаляются без damage кораблю

#### Scenario: Общий cap подавляет оба оружия

- **WHEN** 32 friendly projectiles живы и на одном tick eligible к выстрелу и пушка gunner'а, и MG
  пилота
- **THEN** ни одно оружие не создаёт снаряд, оба pending request очищаются вместе со своими
  cooldowns, а после освобождения cap burst не происходит
