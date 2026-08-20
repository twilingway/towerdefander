## ADDED Requirements

### Requirement: Комната имеет три стабильные роли

Server SHALL назначать controller roles в порядке `pilot`, `gunner`, `shield` при входе и SHALL
сохранять role при reconnect. Player view SHALL публиковать role. Active replacement после expiry
SHALL получить именно освобождённую role.

#### Scenario: Три игрока входят по очереди

- **WHEN** три controller входят в новую room
- **THEN** они получают соответственно pilot, gunner и shield

#### Scenario: Pilot восстанавливается

- **WHEN** pilot reconnect выполняется в grace period
- **THEN** identity и role pilot сохраняются, а duplicate player не создаётся

#### Scenario: Истёкший gunner заменён

- **WHEN** gunner не восстановился за 30 секунд и новый controller входит в active room
- **THEN** replacement получает role gunner и текущий snapshot

### Requirement: Role ограничивает допустимые intents

Pilot SHALL отправлять только `pilot:input`, gunner — `gunner:input`, shield — `shield:input`.
Server SHALL сверять connection identity/role перед mutation.

#### Scenario: Shield пытается двигать замок

- **WHEN** shield controller отправляет strict pilot input
- **THEN** server возвращает `role_mismatch` и castle state не меняется

#### Scenario: Display отправляет role intent

- **WHEN** display отправляет известный gameplay message
- **THEN** server возвращает `not_controller` и не меняет мир

### Requirement: Continuous intents упорядочены

Каждый continuous intent SHALL содержать protocolVersion, roomId, playerId и монотонный safe integer
`sequence`. Server SHALL применять только sequence больше последнего принятого для actor/input type.
Duplicate или out-of-order sequence SHALL игнорироваться без mutation. При disconnect server SHALL
немедленно нейтрализовать continuous input этой role. После успешного reconnect он SHALL сбросить
sequence watermark соединения и принять первый новый пакет, сохраняя player identity и role.

#### Scenario: Пакеты пришли не по порядку

- **WHEN** server после sequence 12 получает sequence 11
- **THEN** последний применённый vector и sequence остаются от пакета 12

#### Scenario: Identity подменена

- **WHEN** controller указывает playerId другого соединения
- **THEN** server возвращает `identity_mismatch` и не записывает sequence

#### Scenario: Pilot отключился с зажатым направлением

- **WHEN** pilot connection закрывается во время движения
- **THEN** server немедленно обнуляет pilot vector, не ожидая окончания grace period или timeout

#### Scenario: Pilot восстановил соединение

- **WHEN** восстановленный pilot отправляет первый valid packet с sequence 1
- **THEN** server принимает packet независимо от watermark старого connection

### Requirement: Gunner fire зависит от состояния, а не частоты сообщений

`gunner:input` SHALL содержать aim vector, boolean `firing` и monotonic sequence. Server SHALL
хранить только последний принятый input, а pure core SHALL создавать projectile по simulation-tick
cooldown. Duplicate heartbeat или более частая доставка SHALL NOT создавать дополнительный
projectile.

#### Scenario: Firing heartbeat доставлен дважды

- **WHEN** server повторно получает тот же gunner sequence с `firing=true`
- **THEN** duplicate игнорируется, а projectile rate остаётся ограничен authoritative cooldown

#### Scenario: Gunner отпускает fire

- **WHEN** новый принятый gunner input содержит `firing=false`
- **THEN** после уже созданного projectile новые projectiles не создаются

### Requirement: Pilot поддерживает keyboard и touch stick

Controller SHALL отправлять leading vector немедленно, если после прошлого send прошло не менее 50
ms; более частые pointer/key changes SHALL coalesce только latest value к следующему 50 ms slot.
Heartbeat SHALL отправляться каждые 100 ms только если после последнего send не было нового packet,
поэтому поток не превышает 20 messages/s. Controller SHALL преобразовывать WASD/arrow keys и
touch/pointer virtual stick в одинаковый нормализованный pilot vector. Gunner и shield SHALL иметь
touch/pointer sticks; keyboard arrows SHALL быть доступным desktop fallback для направления. Gunner
SHALL стрелять кнопкой Fire или Space/LMB; shield SHALL активироваться удержанием Protect или
Space/LMB.

#### Scenario: Pilot нажимает W и D

- **WHEN** pilot controller на компьютере удерживает W и D
- **THEN** он отправляет нормализованный vector вверх-вправо с новым sequence

#### Scenario: Pilot двигает touch stick

- **WHEN** pointer перемещается внутри stick
- **THEN** UI ограничивает knob радиусом и отправляет эквивалентный vector

#### Scenario: Pointermove приходит чаще server limit

- **WHEN** stick получает много pointermove events в течение 50 ms
- **THEN** controller отправляет не более одного leading packet и один coalesced latest packet после
  slot

#### Scenario: Управление отпущено

- **WHEN** key/pointer отпущен или window теряет focus
- **THEN** controller ставит нулевой/inactive input в приоритет и отправляет его в ближайший
  допустимый slot не позднее 50 ms, сохраняя limit 20 messages/s

#### Scenario: Release произошёл внутри занятого slot

- **WHEN** pointer release происходит раньше 50 ms после прошлого send
- **THEN** pending movement заменяется neutral и следующий packet не содержит устаревший active
  input
