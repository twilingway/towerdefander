## MODIFIED Requirements

### Requirement: Пространственные угрозы имеют разные авторитетные поведения

Combat config SHALL описывать каждый enemy kind одной записью таблицы архетипов, содержащей HP,
радиус, скорость, предпочитаемую дистанцию, параметры оружия, стоимость спавна, волну разблокировки
и награды; поведение врага SHALL выводиться из этой записи, а не из отдельных полей на тип. Enemy
kind SHALL быть идентификатором каталога, а не фиксированным перечислением: каталог SHALL содержать
пять встроенных архетипов и SHALL допускать созданные оператором, до документированного предела.
Каждый архетип SHALL нести собственный визуал — силуэт из известного дисплею набора форм, масштаб
модели относительно радиуса поражения, цвета корпуса и обводки, флаг индикатора HP, — который SHALL
публиковаться дисплею один раз на run. Enemy с оружием типа bullet SHALL держать configured
дистанцию до current spaceship position и стрелять линейными bullets; enemy с оружием типа missile
SHALL запускать homing missile, heading которой меняется к current spaceship position по shortest
arc не быстрее configured turn rate. Archetype SHALL нести один или несколько weapons; каждый weapon
SHALL иметь собственный cooldown, собственную дальность открытия огня и SHALL стрелять независимо от
остальных. Weapon SHALL стрелять только когда spaceship ближе его дальности; вне дальности weapon
SHALL оставаться заряженным, а не тратить cooldown впустую, и SHALL выстрелить на первом же tick,
когда цель вошла в дальность. Weapon с burst count больше единицы SHALL создавать за один cooldown
несколько снарядов, разложенных по configured spread, в пределах entity caps. Hostile bullets и
homing missiles SHALL нести собственные damage и shield hit cost, унаследованные от архетипа
стрелка, так что разные типы врагов SHALL мочь иметь разное оружие. Enemy ships SHALL spawn-иться
полностью внутри seeded point на arena circumference, SHALL оставаться внутри circle при
chase/retreat/orbit и SHALL NOT удаляться boundary cleanup. Wave-origin и independent ambient
asteroids SHALL spawn-иться на perimeter с seeded inward velocity и сохранять её до collision,
destruction, lifetime либо выхода за circular padding. Ambient asteroids SHALL генерироваться каждые
40–100 combat ticks из отдельного RNG domain и SHALL NOT входить в remaining wave population. Enemy
decisions SHALL выполняться только fixed step и в стабильном spawn-sequence order.

#### Scenario: Gunship атакует

- **WHEN** gunship жив и его attack cooldown завершён
- **THEN** core создаёт один hostile bullet с stable ID, velocity в направлении spaceship position
  этого tick и damage из архетипа gunship

#### Scenario: Стрелок вне своей дальности

- **WHEN** cooldown weapon завершён, а spaceship дальше дальности открытия огня этого weapon
- **THEN** снаряд не создаётся, weapon остаётся заряженным и стреляет в тот tick, когда дистанция
  впервые оказалась внутри дальности

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

#### Scenario: Враг с несколькими орудиями

- **WHEN** архетип несёт два weapons с разными cooldown и оба готовы
- **THEN** за один tick создаются снаряды обоих, после чего каждый weapon перезаряжается своим
  cooldown, и быстрый успевает выстрелить снова, пока медленный ещё перезаряжается

#### Scenario: Оператор добавляет собственный архетип

- **WHEN** каталог содержит архетип, которого нет среди встроенных, и таблица волн его называет
- **THEN** run спавнит его с его собственными характеристиками, а дисплей рисует его силуэтом и
  цветом из каталога

#### Scenario: Модель крупнее зоны поражения

- **WHEN** архетип задаёт масштаб модели больше единицы
- **THEN** дисплей рисует силуэт увеличенным, а попадания и удержание в арене по-прежнему считаются
  по радиусу поражения

#### Scenario: Дисплей встречает неизвестный силуэт

- **WHEN** снапшот содержит enemy, форма которого дисплею неизвестна
- **THEN** дисплей рисует его запасным силуэтом и продолжает работу

#### Scenario: Разные стрелки наносят разный урон

- **WHEN** hostile bullets двух разных архетипов попадают в spaceship
- **THEN** каждый снимает damage своего архетипа, а не общее значение конфигурации

## ADDED Requirements

### Requirement: Protocol v16 публикует каталог врагов

Protocol v16 SHALL публиковать enemy kind как идентификатор каталога и SHALL включать в display game
view сам каталог: для каждого архетипа его идентификатор, название, силуэт, цвета и флаг индикатора
HP. Create, join и gameplay message v15 SHALL получать `protocol_mismatch` до roster, watermark,
journal или world mutation. Enemy caps SHALL остаться `40/16/96/12/32` и общий cap 196 независимо от
числа архетипов в каталоге.

#### Scenario: V15 создаёт новую комнату

- **WHEN** display отправляет create options с protocolVersion 15
- **THEN** server отклоняет create как `protocol_mismatch` и не создаёт gameplay room

#### Scenario: Display получает каталог run

- **WHEN** run стартует и display получает первый active snapshot
- **THEN** snapshot содержит каталог всех архетипов этого run, включая созданные оператором

#### Scenario: Boss не расширяет caps

- **WHEN** wave plan содержит boss при уже занятом enemy cap
- **THEN** spawn остаётся pending, существующие entities не удаляются и снапшот не превышает
  документированные caps
