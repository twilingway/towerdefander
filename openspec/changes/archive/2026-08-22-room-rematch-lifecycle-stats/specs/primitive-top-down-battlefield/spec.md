## ADDED Requirements

### Requirement: Display показывает terminal rematch и закрытие комнаты

При result React overlay SHALL показывать outcome, final wave/score, readiness каждой role и текст,
что новый run начнётся после готовности 3/3. Frozen Phaser battlefield SHALL оставаться видимым до
rematch либо disposal. Display SHALL иметь отдельное подтверждаемое действие «Закрыть комнату» во
всех phases; оно SHALL выполнять consented leave и возвращать create screen после закрытия.

#### Scenario: Поражение ожидает экипаж

- **WHEN** result имеет defeat и готовы две из трёх roles
- **THEN** overlay показывает final result, 2/3 и не запускает локальный restart

#### Scenario: Новый run стартовал

- **WHEN** server публикует увеличенный runNumber и combat snapshot
- **THEN** result overlay исчезает, Phaser hydrate чистый новый world и не интерполирует от final
  transforms предыдущего run

#### Scenario: Display закрывает комнату

- **WHEN** пользователь подтверждает «Закрыть комнату»
- **THEN** display performs consented leave, показывает create screen, а controllers отключаются
