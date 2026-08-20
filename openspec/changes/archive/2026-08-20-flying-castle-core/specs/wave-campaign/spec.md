## ADDED Requirements

### Requirement: Wave campaign недоступна в первом flying-castle slice

Protocol v5 room SHALL NOT публиковать wave number, wave timer или enemy wave state.

#### Scenario: Active snapshot опубликован

- **WHEN** display получает active protocol v5 snapshot
- **THEN** snapshot не содержит wave fields

## REMOVED Requirements

### Requirement: Матч состоит из пяти волн

**Reason**: Wave campaign не входит в первый flying-castle slice.

**Migration**: Encounter progression будет спроектирована после проверки core controls.

### Requirement: Обычные враги имеют три серверных типа

**Reason**: В первом slice врагов нет.

**Migration**: Enemy taxonomy будет добавлена вместе с combat/damage.

### Requirement: Пятая волна содержит босса

**Reason**: В новом slice отсутствуют волны и боссы.

**Migration**: Boss encounters станут отдельным capability.
