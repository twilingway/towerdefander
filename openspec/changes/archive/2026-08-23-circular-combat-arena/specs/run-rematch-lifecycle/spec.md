## MODIFIED Requirements

### Requirement: Run epoch изолирует последовательные забеги

Current strict protocol SHALL публиковать positive safe integer `runNumber` в active/result
snapshots и SHALL требовать expected runNumber во всех ready, gameplay, upgrade и rematch commands.
Lobby до первого run SHALL иметь runNumber 0. Server SHALL проверять protocol/schema, connection
identity и runNumber до phase, sequence, action journal либо simulation mutation. Packet другого run
SHALL получить actor-only `stale_run` и SHALL NOT менять watermark, journal, readiness или world.

#### Scenario: Запоздавшее движение первого забега

- **WHEN** после старта run 2 pilot отправляет valid-shape input с runNumber 1 и большим sequence
- **THEN** server возвращает `stale_run`, не записывает sequence и не двигает spaceship

#### Scenario: Старый upgrade action повторён после rematch

- **WHEN** после старта run 2 controller повторяет accepted upgrade command run 1
- **THEN** server возвращает `stale_run`, не применяет modifier и не изменяет journal run 2

#### Scenario: Клиент v9 подключается к v10

- **WHEN** create/join либо message использует protocolVersion 10
- **THEN** server отклоняет его стабильной ошибкой `protocol_mismatch` без mutation
