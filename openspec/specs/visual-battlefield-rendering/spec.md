# visual-battlefield-rendering Specification

## Purpose

TBD - created by archiving change build-visual-wave-mvp. Update Purpose after archive.

## Requirements

### Requirement: Legacy road scene недоступна в flying-castle room

Protocol v5 display SHALL render только top-down world из `primitive-top-down-battlefield` и SHALL
NOT загружать capacity-keyed road/castle environment assets.

#### Scenario: Flying-castle snapshot получен

- **WHEN** display получает active protocol v5 world
- **THEN** Phaser scene создаёт primitive top-down world без road lanes и gate anchors
