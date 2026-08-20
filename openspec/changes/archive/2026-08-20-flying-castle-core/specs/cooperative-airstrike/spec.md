## ADDED Requirements

### Requirement: Legacy airstrike недоступен в flying-castle room

Protocol v5 SHALL NOT принимать airstrike command и SHALL NOT публиковать charge или sector targets.

#### Scenario: Controller отправляет legacy airstrike message

- **WHEN** protocol v5 controller отправляет неизвестный message type `player:airstrike`
- **THEN** server не регистрирует handler и state не изменяется

## REMOVED Requirements

### Requirement: Убийства заряжают общую способность

**Reason**: В первом flying-castle slice нет врагов, убийств и общей charge.

**Migration**: Cooperative abilities будут рассмотрены после core combat.

### Requirement: Игрок направляет авиаудар в любой сектор

**Reason**: Sector topology и airstrike заменены прямым управлением пушкой.

**Migration**: Gunner использует sequenced aim/firing state и authoritative cooldown из
`three-role-controls`.

### Requirement: Авиаудар идемпотентен

**Reason**: Команда airstrike удаляется из protocol v5.

**Migration**: Duplicate/out-of-order gunner inputs игнорируются, а projectile rate задаётся
simulation cooldown.
