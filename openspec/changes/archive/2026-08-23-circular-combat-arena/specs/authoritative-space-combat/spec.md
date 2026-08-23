## MODIFIED Requirements

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
