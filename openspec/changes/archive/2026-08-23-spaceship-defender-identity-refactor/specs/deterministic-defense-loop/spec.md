## ADDED Requirements

### Requirement: Legacy defense loop capability retired

Active product SHALL NOT implement this legacy capability. Its former behavioral requirements are
removed by this change and historical text remains only in immutable OpenSpec archives and Git.

#### Scenario: Active spec catalog is reconciled

- **WHEN** the rename change is archived and the OpenSpec 1.6 tombstone migration completes
- **THEN** SpaceShip Defender production code and current product requirements do not expose the
  retired gameplay capability

## REMOVED Requirements

### Requirement: Legacy defense loop недоступен в flying-castle room

**Reason**: Classic road/gate defense loop is not part of SpaceShip Defender. **Migration**: Use
`spaceship-simulation`, `wave-campaign` and `authoritative-space-combat`.

Protocol v5 SHALL NOT создавать sector defense state или запускать spawn/attack/gate transitions.

#### Scenario: Flying-castle match стартует

- **WHEN** три role controllers становятся ready
- **THEN** server создаёт только flying-castle state из capability `flying-castle-simulation`
