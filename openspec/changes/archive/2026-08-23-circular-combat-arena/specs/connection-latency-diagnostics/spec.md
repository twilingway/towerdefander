## MODIFIED Requirements

### Requirement: Probe authorization не доверяет client telemetry

Server SHALL принимать latency pong от display и controller только после current strict
protocol/schema и room identity checks. ProbeId SHALL принадлежать outstanding probe того же
connection. Client SHALL NOT отправлять готовое значение RTT или timestamp, а telemetry SHALL NOT
менять sequence watermark, encounter tick, arena geometry, entities, HP, wave, upgrade journal,
fire/shield state, cooldown или energy. Valid duplicate, late, unknown либо чужой probeId SHALL
молча игнорироваться без изменения current sample; malformed payload SHALL получать actor-only
`invalid_message`, а protocol mismatch — actor-only `protocol_mismatch`.

#### Scenario: Controller возвращает probe другого игрока

- **WHEN** pilot отправляет valid envelope с outstanding probeId gunner
- **THEN** server игнорирует pong и latency обоих игроков не изменяется

#### Scenario: Pong повторён

- **WHEN** connection повторяет уже принятый probeId
- **THEN** server не добавляет второй sample и не меняет combat/upgrade state

#### Scenario: Устаревший pong

- **WHEN** v11 room получает latency pong с protocolVersion 10
- **THEN** server возвращает `protocol_mismatch` только этому connection и telemetry не изменяется
