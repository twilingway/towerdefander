## ADDED Requirements

### Requirement: Две touch-зоны работают независимо и соответствуют роли

Левый joystick SHALL отправлять pilot movement, gunner aim либо shield aim. Правая круглая
action-zone SHALL отправлять pilot machine-gun hold, gunner cannon hold либо один shield ON/OFF
toggle за завершённое нажатие. Зоны SHALL одновременно владеть разными pointerId; событие одной зоны
SHALL NOT отменять intent другой. Pointer cancel/lost capture, blur, visibility loss, disconnect и
выход из combat SHALL безопасно прекращать movement/fire; shield toggle SHALL оставаться устойчивым
и выключаться server disconnect neutralization, а не отпусканием пальца.

#### Scenario: Pilot движется и стреляет двумя пальцами

- **WHEN** pilot удерживает левый joystick вправо pointerId 1 и правую action-zone pointerId 2
- **THEN** outgoing latest intent одновременно содержит movement вправо и `mgFiring=true`

#### Scenario: Gunner наводится и стреляет двумя пальцами

- **WHEN** gunner удерживает aim вверх слева и fire справа
- **THEN** turret target обновляется вверх, а `firing=true` не отменяет aim pointer

#### Scenario: Shield переключён правой зоной

- **WHEN** shield operator завершает одно нажатие правой action-zone при достаточной energy
- **THEN** desired active меняется один раз и отпускание не создаёт обратный toggle

#### Scenario: Второй touch больше не отбрасывается

- **WHEN** левый touch уже является primary, а правый получает `isPrimary=false` с другим pointerId
- **THEN** правая action-zone всё равно принимает свой pointer и выполняет role action

#### Scenario: Fire pointer отменён системой

- **WHEN** browser отправляет pointercancel либо lostpointercapture для удерживаемого правого action
- **THEN** fire становится false, а левый joystick продолжает принадлежать своему pointerId
