# shared-defense-economy Specification

## Purpose

TBD - created by archiving change implement-first-defense-loop. Update Purpose after archive.

## Requirements

### Requirement: Legacy defense economy недоступна в flying-castle room

Protocol v5 SHALL NOT принимать repair/upgrade commands и SHALL NOT публиковать treasury, gate или
defense level.

#### Scenario: Controller отправляет legacy repair message

- **WHEN** protocol v5 controller отправляет неизвестный message type `player:repair`
- **THEN** server не регистрирует handler и state не изменяется
