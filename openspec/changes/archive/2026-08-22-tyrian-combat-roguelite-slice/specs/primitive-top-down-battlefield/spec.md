## ADDED Requirements

### Requirement: Display показывает authoritative space combat примитивами

Phaser SHALL создавать primitive visual по stable entity ID для enemy ships, asteroids, friendly и
hostile bullets и homing missiles. Existing object SHALL обновляться/interpolate in place, а
authoritative removal SHALL удалить visual. React HUD SHALL показывать castle HP, wave, score,
encounter phase и intermission countdown. Display SHALL NOT рассчитывать homing, collision, damage,
death, reward либо upgrade result.

#### Scenario: Gunship появился

- **WHEN** display snapshot впервые содержит enemy с новым stable ID
- **THEN** Phaser создаёт один отличимый primitive и последующие snapshots двигают тот же object

#### Scenario: Ракета поворачивает

- **WHEN** authoritative missile snapshots меняют position/heading
- **THEN** display интерполирует transform по tick time и не корректирует heading к castle локально

#### Scenario: Entity уничтожена

- **WHEN** следующий authoritative snapshot больше не содержит entity ID
- **THEN** visual удаляется один раз, а optional impact effect не меняет trusted HP/score

#### Scenario: Начался выбор улучшения

- **WHEN** encounter phase становится intermission
- **THEN** battlefield остаётся видимым и замороженным, а React overlay показывает wave result и
  authoritative countdown

#### Scenario: Замок уничтожен

- **WHEN** encounter phase становится defeated и HP равен нулю
- **THEN** display показывает frozen final battlefield, wave/score и поражение без локального
  restart

### Requirement: Combat interpolation не перезапускается от неизменившихся patches

Display SHALL интерполировать новые dynamic entities между previous/latest 50-ms snapshots, сохраняя
shortest-angle behavior для headings. Patch telemetry, offers, HP или другого HUD state с тем же
gameplay tick SHALL NOT перезапускать entity transition. Первый entity snapshot и hydration MAY snap
к authoritative transform; дальнейшие ticks SHALL снова interpolate.

#### Scenario: Обновился только ping

- **WHEN** room patch меняет latency, но сохраняет combat tick и entity transforms
- **THEN** Phaser runtime не получает новый movement transition и движущиеся visuals не дёргаются

#### Scenario: Display reconnect в бою

- **WHEN** display восстанавливается после пропущенных combat ticks
- **THEN** первый snapshot snaps к current castle/entities/HP, а следующий tick снова
  интерполируется без проигрывания пропущенных collisions
