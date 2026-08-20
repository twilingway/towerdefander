## ADDED Requirements

### Requirement: Legacy road scene недоступна в flying-castle room

Protocol v5 display SHALL render только top-down world из `primitive-top-down-battlefield` и SHALL
NOT загружать capacity-keyed road/castle environment assets.

#### Scenario: Flying-castle snapshot получен

- **WHEN** display получает active protocol v5 world
- **THEN** Phaser scene создаёт primitive top-down world без road lanes и gate anchors

## REMOVED Requirements

### Requirement: Общий экран показывает визуальное поле боя

**Reason**: Статичные дороги и ворота заменяются прокручиваемой top-down картой.

**Migration**: Использовать `primitive-top-down-battlefield`.

### Requirement: Враги визуально различаются и движутся

**Reason**: Враги не входят в первый flying-castle slice.

**Migration**: Визуализация врагов будет добавлена отдельным change.

### Requirement: Боевые эффекты не являются источником истины

**Reason**: Airstrike и defense effects удалены из нового режима.

**Migration**: Общий принцип server authority сохранён для projectiles в
`primitive-top-down-battlefield`.

### Requirement: Рисованное поле имеет безопасный fallback

**Reason**: Новый slice использует только code-native primitives и не загружает painted assets.

**Migration**: Asset compatibility будет определена после утверждения нового art direction.
