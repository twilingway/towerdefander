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

### Requirement: Display показывает top-down мир примитивами

Phaser SHALL отображать square bounding world `4400×4400`, одну arena circumference radius 2200,
background grid только внутри arena, распределённые внутри circle декоративные не участвующие в
collision примитивы, spaceship body, turret, shield arc и projectiles средствами Graphics/Shape без
bitmap assets. Область за circle SHALL оставаться более тёмным deep-space background. Active
battlefield SHALL занимать весь CSS viewport без card padding, border, фиксированной 16:9 рамки и
letterbox. Базовая logical view SHALL браться из display-проекции снапшота: ширина равна
authoritative `cameraViewWidth`, высота — `9/16` от неё, а не литералу в коде дисплея. При другом
aspect ratio camera SHALL расширять видимую область по одной оси без растяжения world/circle и без
обрезания базовой области. Изменение authoritative кадра SHALL перенастраивать camera без
пересоздания Room/runtime. React HUD, room code и connection status SHALL быть overlays и SHALL NOT
уменьшать Phaser viewport.

#### Scenario: Матч начинается

- **WHEN** room переходит в active и display получает первый snapshot
- **THEN** canvas покрывает viewport и показывает круглую нерастянутую arena, grid внутри неё,
  spaceship и примитивный мир, а компактный React HUD поверх показывает roles/status/ping

#### Scenario: Снаряд создан

- **WHEN** snapshot впервые содержит projectile `entityId`
- **THEN** display создаёт отдельный круг и двигает его к авторитетной position

#### Scenario: Экран меняет размер

- **WHEN** active display меняется между `1920×1080`, `1366×768` и `1024×768`
- **THEN** renderer/camera обновляются без пересоздания Room/runtime, canvas покрывает viewport,
  arena остаётся кругом и базовая logical область видима

#### Scenario: Оператор расширил кадр камеры

- **WHEN** активный пресет задаёт `cameraViewWidth` вдвое больше прежнего и начинается новый run
- **THEN** тот же renderer показывает вдвое более широкий участок мира с той же пропорцией `16:9` и
  прежним поведением camera bounds

#### Scenario: Ползунок превью меняет кадр

- **WHEN** в dev-превью дисплея сдвинут ползунок ширины кадра камеры
- **THEN** сцена немедленно перерисовывается новым кадром без перезагрузки, а показанное число
  совпадает с тем, которое сохраняется в консоли баланса
