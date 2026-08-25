## MODIFIED Requirements

### Requirement: Display показывает authoritative space combat примитивами

Phaser SHALL создавать primitive visual по stable entity ID для enemy ships, asteroids, friendly и
hostile bullets и homing missiles. Каждый enemy kind SHALL иметь собственный различимый силуэт и
цвет, а выбор визуала SHALL быть полным по набору kinds, так что новый kind SHALL NOT молча
отрисовываться силуэтом другого типа. Размер примитива enemy SHALL выводиться из authoritative
радиуса entity, чтобы крупные архетипы читались крупными. Enemy архетипа boss SHALL показывать
индикатор HP над корпусом на основе authoritative `hp` и `maxHp`. Existing object SHALL
обновляться/interpolate in place, а authoritative removal SHALL удалить visual. React HUD SHALL
показывать spaceship HP, wave, score, encounter phase и intermission countdown. Display SHALL NOT
рассчитывать homing, collision, damage, death, reward либо upgrade result.

#### Scenario: Gunship появился

- **WHEN** display snapshot впервые содержит enemy с новым stable ID
- **THEN** Phaser создаёт один отличимый primitive и последующие snapshots двигают тот же object

#### Scenario: Пять типов различимы

- **WHEN** snapshot содержит enemies всех поддерживаемых kinds одновременно
- **THEN** каждый отрисован своим силуэтом и цветом, и ни один не повторяет визуал другого kind

#### Scenario: Крупный архетип читается крупным

- **WHEN** snapshot содержит enemies с существенно разными радиусами
- **THEN** размеры их примитивов отличаются пропорционально authoritative радиусу

#### Scenario: Boss показывает остаток HP

- **WHEN** boss получает урон и следующий snapshot уменьшает его `hp`
- **THEN** индикатор над боссом отражает новое отношение `hp` к `maxHp` без локального пересчёта
  урона

#### Scenario: Ракета поворачивает

- **WHEN** authoritative missile snapshots меняют position/heading
- **THEN** display интерполирует transform по tick time и не корректирует heading к spaceship
  локально

#### Scenario: Entity уничтожена

- **WHEN** следующий authoritative snapshot больше не содержит entity ID
- **THEN** visual удаляется один раз, а optional impact effect не меняет trusted HP/score

#### Scenario: Начался выбор улучшения

- **WHEN** encounter phase становится intermission
- **THEN** battlefield остаётся видимым и замороженным, а React overlay показывает wave result и
  authoritative countdown

#### Scenario: Spaceship уничтожен

- **WHEN** encounter phase становится `result`, outcome равен `defeat` и HP равен нулю
- **THEN** display показывает frozen final battlefield, wave/score и поражение без локального
  restart
