# connection-latency-diagnostics Specification

## Purpose

TBD - created by archiving change latency-fullscreen-world. Update Purpose after archive.

## Requirements

### Requirement: Server измеряет RTT каждого room connection

Server SHALL сразу после join/reconnect и затем не чаще одного раза в 2000 ms отправлять каждому
подключённому display/controller не более одного strict
`server:latency-probe {protocolVersion,probeId}`. Client SHALL немедленно отвечать strict
`client:latency-pong {protocolVersion,roomId,probeId}`. Server SHALL вычислять RTT собственным
монотонным clock, округлять его до integer `0..5000 ms` и публиковать median последних максимум пяти
valid samples. До первого sample, после 5000 ms timeout, при disconnect и в начале reconnect
значение SHALL быть `null`, которое UI SHALL отображать как `—`, а не как ноль.

#### Scenario: Все участники отвечают

- **WHEN** display и три controllers возвращают соответствующие им probeId
- **THEN** authoritative room state публикует `displayLatencyMs` и отдельный `latencyMs` каждого
  player с server-measured RTT

#### Scenario: История сглаживает выброс

- **WHEN** connection последовательно получает пять samples `20, 22, 200, 24, 26`
- **THEN** опубликованный ping равен median `24 ms`

#### Scenario: Probe истёк

- **WHEN** valid pong не получен в течение 5000 ms
- **THEN** connection latency становится `null`, outstanding probe удаляется и server может создать
  новый уникальный probe

#### Scenario: Controller переподключился

- **WHEN** controller transport разрывается и reconnect завершается в grace period
- **THEN** role/identity сохраняются, старые samples и probe забываются, ping остаётся `—` до нового
  valid pong

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

### Requirement: Room UI показывает качество всех соединений

Display SHALL показывать на active battlefield и в lobby отдельные строки `Экран → сервер`, `Пилот`,
`Наводчик`, `Щит` со значением `N мс` либо `—`; незанятый или disconnected crew slot SHALL
показывать `—`. Controller SHALL показывать собственный authoritative ping с подписью `До сервера`.
UI SHALL NOT называть RTT полной задержкой управления или прямым display-to-controller ping. IP,
client timestamps и input contents SHALL NOT публиковаться.

#### Scenario: Gunner имеет высокий ping

- **WHEN** display view содержит gunner `latencyMs=180`, pilot `32`, shield `47` и
  `displayLatencyMs=18`
- **THEN** battlefield overlay показывает `Экран → сервер 18 мс`, `Пилот 32 мс`, `Наводчик 180 мс`,
  `Щит 47 мс`

#### Scenario: Shield отключился

- **WHEN** shield player остаётся в grace roster с `connected=false`
- **THEN** display и shield controller не показывают старый sample и отображают `—`

### Requirement: Служебный pong не вытесняет управление

Server SHALL принимать не менее 25 входящих сообщений в секунду от одного connection, сохраняя
continuous gameplay scheduler не чаще 20 сообщений в секунду и fixed simulation step 50 ms. Latency
pong SHALL учитываться rate limiter, но SHALL NOT вытеснять допустимый gameplay stream.

#### Scenario: Stick используется одновременно с диагностикой

- **WHEN** controller отправляет continuous inputs с допустимой частотой и один latency pong в
  двухсекундном интервале
- **THEN** server не отключает connection за превышение rate limit и применяет gameplay inputs в
  прежнем порядке
