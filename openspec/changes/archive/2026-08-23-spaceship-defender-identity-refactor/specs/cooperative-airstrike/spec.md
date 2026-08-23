## ADDED Requirements

### Requirement: Legacy cooperative airstrike capability retired

Active product SHALL NOT implement this legacy capability. Its former behavioral requirements are
removed by this change and historical text remains only in immutable OpenSpec archives and Git.

#### Scenario: Active spec catalog is reconciled

- **WHEN** the rename change is archived and the OpenSpec 1.6 tombstone migration completes
- **THEN** SpaceShip Defender production code and current product requirements do not expose the
  retired gameplay capability

## REMOVED Requirements

### Requirement: Legacy airstrike недоступен в flying-castle room

**Reason**: Classic Tower Defense airstrike is not part of SpaceShip Defender. **Migration**: Use
gunner projectiles and `authoritative-space-combat`.

Protocol v5 SHALL NOT принимать airstrike command и SHALL NOT публиковать charge или sector targets.

#### Scenario: Controller отправляет legacy airstrike message

- **WHEN** protocol v5 controller отправляет неизвестный message type `player:airstrike`
- **THEN** server не регистрирует handler и state не изменяется
