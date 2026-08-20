# wave-campaign Specification

## Purpose

TBD - created by archiving change build-visual-wave-mvp. Update Purpose after archive.

## Requirements

### Requirement: Wave campaign недоступна в первом flying-castle slice

Protocol v5 room SHALL NOT публиковать wave number, wave timer или enemy wave state.

#### Scenario: Active snapshot опубликован

- **WHEN** display получает active protocol v5 snapshot
- **THEN** snapshot не содержит wave fields
