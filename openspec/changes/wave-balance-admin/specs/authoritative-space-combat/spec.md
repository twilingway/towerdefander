## MODIFIED Requirements

### Requirement: Пространственные угрозы имеют разные авторитетные поведения

Combat config SHALL описывать каждый enemy kind одной записью таблицы архетипов, содержащей HP,
радиус, скорость, предпочитаемую дистанцию, параметры оружия, стоимость спавна, волну разблокировки
и награды; поведение врага SHALL выводиться из этой записи, а не из отдельных полей на тип. Wave
SHALL создавать `gunship`, `missileCarrier`, `sniper`, `interceptor`, `boss` и `asteroid`. Enemy с
оружием типа bullet SHALL держать configured дистанцию до current spaceship position и стрелять
линейными bullets; enemy с оружием типа missile SHALL запускать homing missile, heading которой
меняется к current spaceship position по shortest arc не быстрее configured turn rate. Archetype с
burst count больше единицы SHALL создавать за один cooldown несколько снарядов, разложенных по
configured spread, в пределах entity caps. Hostile bullets и homing missiles SHALL нести собственные
damage и shield hit cost, унаследованные от архетипа стрелка, так что разные типы врагов SHALL мочь
иметь разное оружие. Enemy ships SHALL spawn-иться полностью внутри seeded point на arena
circumference, SHALL оставаться внутри circle при chase/retreat/orbit и SHALL NOT удаляться boundary
cleanup. Wave-origin и independent ambient asteroids SHALL spawn-иться на perimeter с seeded inward
velocity и сохранять её до collision, destruction, lifetime либо выхода за circular padding. Ambient
asteroids SHALL генерироваться каждые 40–100 combat ticks из отдельного RNG domain и SHALL NOT
входить в remaining wave population. Enemy decisions SHALL выполняться только fixed step и в
стабильном spawn-sequence order.

#### Scenario: Gunship атакует

- **WHEN** gunship жив и его attack cooldown завершён
- **THEN** core создаёт один hostile bullet с stable ID, velocity в направлении spaceship position
  этого tick и damage из архетипа gunship

#### Scenario: Enemy отступает у края

- **WHEN** preferred-distance AI задаёт outward velocity у arena circumference
- **THEN** enemy остаётся полностью внутри, сохраняет tangent и не исчезает из wave без destruction

#### Scenario: Ракета наводится

- **WHEN** spaceship пересекает направление летящей homing missile
- **THEN** missile поворачивает к новой позиции не быстрее max turn-rate своего архетипа и не
  прыгает сразу на target

#### Scenario: Астероид летит через арену

- **WHEN** asteroid не столкнулся с projectile, shield или spaceship
- **THEN** каждый fixed step изменяет его position только по сохранённой velocity, а после circular
  padded envelope/lifetime он удаляется

#### Scenario: Combat создаёт ambient hazards

- **WHEN** combat остаётся active и asteroid/global caps допускают spawn
- **THEN** отдельный scheduler детерминированно создаёт следующий ambient asteroid с новой
  entry/exit trajectory, не изменяя wave spawn и offer RNG streams

#### Scenario: Sniper бьёт с дальней дистанции

- **WHEN** sniper жив, его attack cooldown завершён и spaceship находится в арене
- **THEN** core создаёт один hostile bullet с damage и скоростью из архетипа sniper, а сам sniper
  удерживает свою большую preferred distance

#### Scenario: Interceptor давит частым слабым огнём

- **WHEN** interceptor сближается до своей малой preferred distance и его cooldown завершён
- **THEN** core создаёт bullet с малым damage архетипа interceptor и назначает короткий cooldown
  того же архетипа

#### Scenario: Boss стреляет залпом

- **WHEN** boss с burst count больше единицы завершает cooldown и missile cap свободен
- **THEN** core создаёт несколько homing missiles за один tick в пределах caps и назначает один
  общий cooldown без немедленного повторного залпа

#### Scenario: Разные стрелки наносят разный урон

- **WHEN** hostile bullets двух разных архетипов попадают в spaceship
- **THEN** каждый снимает damage своего архетипа, а не общее значение конфигурации

## ADDED Requirements

### Requirement: Protocol v15 публикует расширенный набор enemy kinds

Protocol v15 SHALL публиковать enemy kind из набора `gunship`, `missileCarrier`, `sniper`,
`interceptor`, `boss` в display game views. Create, join и gameplay message v14 SHALL получать
`protocol_mismatch` до roster, watermark, journal или world mutation. Enemy caps SHALL остаться
`40/16/96/12/32` и общий cap 196 независимо от числа архетипов.

#### Scenario: V14 создаёт новую комнату

- **WHEN** display отправляет create options с protocolVersion 14
- **THEN** server отклоняет create как `protocol_mismatch` и не создаёт gameplay room

#### Scenario: Display получает новый kind

- **WHEN** authoritative snapshot содержит enemy с kind `sniper`, `interceptor` либо `boss`
- **THEN** v15 projection проходит валидацию схемы и содержит этот kind без замены на существующий

#### Scenario: Boss не расширяет caps

- **WHEN** wave plan содержит boss при уже занятом enemy cap
- **THEN** spawn остаётся pending, существующие entities не удаляются и снапшот не превышает
  документированные caps
