## ADDED Requirements

### Requirement: Legacy defense economy недоступна в flying-castle room

Protocol v5 SHALL NOT принимать repair/upgrade commands и SHALL NOT публиковать treasury, gate или
defense level.

#### Scenario: Controller отправляет legacy repair message

- **WHEN** protocol v5 controller отправляет неизвестный message type `player:repair`
- **THEN** server не регистрирует handler и state не изменяется

## REMOVED Requirements

### Requirement: Ремонт ворот применяется атомарно

**Reason**: В flying-castle slice нет ворот, treasury и repair.

**Migration**: Новая resource economy будет спроектирована после damage model.

### Requirement: Улучшение защиты применяется атомарно

**Reason**: Defense upgrades не входят в первый slice.

**Migration**: Upgrade system будет отдельным change.

### Requirement: Игровые действия идемпотентны в пределах комнаты

**Reason**: Старый journal покрывал repair/upgrade; эти команды удаляются.

**Migration**: Первый slice не содержит resource-spending actions; firing ограничен sequence и
simulation cooldown.
