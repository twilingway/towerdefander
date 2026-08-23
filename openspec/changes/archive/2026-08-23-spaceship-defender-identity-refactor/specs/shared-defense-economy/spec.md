## ADDED Requirements

### Requirement: Legacy defense economy capability retired

Active product SHALL NOT implement this legacy capability. Its former behavioral requirements are
removed by this change and historical text remains only in immutable OpenSpec archives and Git.

#### Scenario: Active spec catalog is reconciled

- **WHEN** the rename change is archived and the OpenSpec 1.6 tombstone migration completes
- **THEN** SpaceShip Defender production code and current product requirements do not expose the
  retired gameplay capability

## REMOVED Requirements

### Requirement: Legacy defense economy недоступна в flying-castle room

**Reason**: Classic shared repair/upgrade treasury is not part of SpaceShip Defender. **Migration**:
Future credits and in-combat modernization require a separate accepted change.

Protocol v5 SHALL NOT принимать repair/upgrade commands и SHALL NOT публиковать treasury, gate или
defense level.

#### Scenario: Controller отправляет legacy repair message

- **WHEN** protocol v5 controller отправляет неизвестный message type `player:repair`
- **THEN** server не регистрирует handler и state не изменяется
