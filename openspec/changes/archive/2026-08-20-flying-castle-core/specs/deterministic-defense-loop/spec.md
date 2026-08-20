## ADDED Requirements

### Requirement: Legacy defense loop недоступен в flying-castle room

Protocol v5 SHALL NOT создавать sector defense state или запускать spawn/attack/gate transitions.

#### Scenario: Flying-castle match стартует

- **WHEN** три role controllers становятся ready
- **THEN** server создаёт только flying-castle state из capability `flying-castle-simulation`

## REMOVED Requirements

### Requirement: Бой создаётся из явной конфигурации

**Reason**: Sector defense configuration заменяется flying-castle world configuration.

**Migration**: Использовать capability `flying-castle-simulation`.

### Requirement: Симуляция развивается фиксированными шагами

**Reason**: Старый defense transition больше не является активным игровым циклом.

**Migration**: Fixed-step guarantee сохранена в `flying-castle-simulation` с шагом 50 ms.

### Requirement: Бой имеет однозначный результат

**Reason**: Первый slice не содержит победу, поражение или damage.

**Migration**: Результат боя будет специфицирован с enemies/damage отдельным change.
