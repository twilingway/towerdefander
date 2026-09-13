## MODIFIED Requirements

### Requirement: Сервер запускает матч по размеру экипажа

Комната SHALL создаваться с размером экипажа 1, 2 или 3, полученным в опциях создания от display, и
SHALL публиковать его в обеих проекциях. Комната SHALL принимать не больше этого числа controller и
SHALL отказывать следующему. Server SHALL запускать simulation только когда выполнены три условия:
все места экипажа заняты, каждый игрок ready, и каждое подключение, объявившее загрузку ресурсов,
сообщило о готовности. Последнее условие снимается, если после выполнения первых двух прошло 20
секунд (см. `match-asset-readiness`). Strict `controller:ready` SHALL содержать protocolVersion,
roomId и playerId; server SHALL сверять actor и принимать его только в lobby. Ready повторяем и
идемпотентен. После старта свежий controller может занять только истёкшую свободную role и
становится ready автоматически.

#### Scenario: Комната на одного игрока

- **WHEN** комната создана с размером экипажа 1 и единственный controller стал ready
- **THEN** phase становится `active`, создаётся spaceship state и запускается fixed-step timer

#### Scenario: Комната на двоих ждёт второго

- **WHEN** комната создана с размером экипажа 2, подключён и ready только один controller
- **THEN** phase остаётся `lobby`

#### Scenario: Комната на троих не изменилась

- **WHEN** комната создана с размером экипажа 3 и третья занятая role стала ready
- **THEN** phase становится `active`

#### Scenario: Лишний controller отклонён

- **WHEN** в комнату с размером экипажа 1 пытается войти второй controller
- **THEN** server отказывает в подключении, а идущая session не затрагивается

#### Scenario: Ready отправлен после старта

- **WHEN** controller отправляет `controller:ready` в active phase
- **THEN** server возвращает `invalid_phase` и world не изменяется

#### Scenario: Соло-игрок вернулся в grace period

- **WHEN** единственный игрок комнаты reconnect завершается до истечения grace period
- **THEN** playerId, role, размер экипажа и текущий world сохраняются

#### Scenario: Экипаж готов, экран грузится

- **WHEN** все места заняты и ready, а display, объявивший загрузку, ещё не сообщил о готовности
- **THEN** phase остаётся `lobby`, пока display не сообщит о готовности или не пройдут 20 секунд
