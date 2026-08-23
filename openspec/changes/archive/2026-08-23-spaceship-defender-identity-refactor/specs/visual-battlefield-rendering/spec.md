## ADDED Requirements

### Requirement: Legacy road battlefield capability retired

Active product SHALL NOT implement this legacy capability. Its former behavioral requirements are
removed by this change and historical text remains only in immutable OpenSpec archives and Git.

#### Scenario: Active spec catalog is reconciled

- **WHEN** the rename change is archived and the OpenSpec 1.6 tombstone migration completes
- **THEN** SpaceShip Defender production code and current product requirements do not expose the
  retired gameplay capability

## REMOVED Requirements

### Requirement: Legacy road scene недоступна в flying-castle room

**Reason**: Classic roads/gates/towers are not part of SpaceShip Defender. **Migration**: Use
`primitive-top-down-battlefield` and the documented deep-space art direction.

Protocol v5 display SHALL render только top-down world из `primitive-top-down-battlefield` и SHALL
NOT загружать capacity-keyed road/castle environment assets.

#### Scenario: Flying-castle snapshot получен

- **WHEN** display получает active protocol v5 world
- **THEN** Phaser scene создаёт primitive top-down world без road lanes и gate anchors
