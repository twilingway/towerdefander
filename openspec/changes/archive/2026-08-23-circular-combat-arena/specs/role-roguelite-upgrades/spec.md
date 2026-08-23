## MODIFIED Requirements

### Requirement: Upgrade choice строго авторизован и идемпотентен

Strict `upgrade:choose` SHALL содержать current protocolVersion, roomId, playerId, UUID `actionId`,
`waveNumber`, `offerId` и `upgradeId`. Server SHALL вывести actor из connection и проверить strict
envelope/identity, затем duplicate action fingerprint, затем assigned role, intermission/current
wave, own offer и existing selection до mutation. Selection SHALL атомарно применить ровно один
modifier и сохранить outcome. Journal SHALL хранить последние 32 action fingerprints/outcomes на
player identity, переживать reconnect и удаляться при окончательной замене identity. Evicted action
со старым offer SHALL оставаться неприменимым.

#### Scenario: Выбор доставлен дважды

- **WHEN** accepted command повторяется с тем же actionId и fingerprint
- **THEN** accepted duplicate молчит/остаётся видимым в authoritative selection, rejected business
  duplicate повторяет прежнюю actor-only error, а modifier не применяется второй раз

#### Scenario: Accepted выбор повторён после начала combat

- **WHEN** ранее accepted exact actionId/fingerprint повторяется после завершения intermission
- **THEN** journal replay выполняется до phase check, transport молчит и modifier не применяется
  второй раз

#### Scenario: ActionId использован с другим upgrade

- **WHEN** известный actionId повторяется с другим offerId либо upgradeId
- **THEN** server возвращает `action_conflict`, не перезаписывает journal и не меняет modifiers

#### Scenario: Gunner выбирает offer pilot

- **WHEN** gunner отправляет schema-valid command с pilot offerId
- **THEN** server возвращает `role_mismatch` и не записывает selection

#### Scenario: Старый offer повторён в следующей wave

- **WHEN** command с уже истёкшим offerId отсутствует в bounded journal и приходит в новой
  intermission
- **THEN** server возвращает `action_not_available`, а старый upgrade не применяется

#### Scenario: Роль уже выбрала другой upgrade

- **WHEN** controller отправляет новый actionId для той же role/wave после accepted selection
- **THEN** server возвращает `already_chosen` и modifiers не меняются

#### Scenario: Display пытается выбрать upgrade

- **WHEN** display отправляет strict `upgrade:choose`
- **THEN** server возвращает `not_controller` и offers/modifiers не меняются
