# deterministic-defense-loop Specification

## Purpose

TBD - created by archiving change implement-first-defense-loop. Update Purpose after archive.

## Requirements

### Requirement: Legacy defense loop недоступен в flying-castle room

Protocol v5 SHALL NOT создавать sector defense state или запускать spawn/attack/gate transitions.

#### Scenario: Flying-castle match стартует

- **WHEN** три role controllers становятся ready
- **THEN** server создаёт только flying-castle state из capability `flying-castle-simulation`
