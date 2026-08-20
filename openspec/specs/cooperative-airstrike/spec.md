# cooperative-airstrike Specification

## Purpose

TBD - created by archiving change build-visual-wave-mvp. Update Purpose after archive.

## Requirements

### Requirement: Legacy airstrike недоступен в flying-castle room

Protocol v5 SHALL NOT принимать airstrike command и SHALL NOT публиковать charge или sector targets.

#### Scenario: Controller отправляет legacy airstrike message

- **WHEN** protocol v5 controller отправляет неизвестный message type `player:airstrike`
- **THEN** server не регистрирует handler и state не изменяется
