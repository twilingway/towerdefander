# primitive-top-down-battlefield Specification

## Purpose

TBD - created by archiving change flying-castle-core. Update Purpose after archive.

## Requirements

### Requirement: Display показывает top-down мир примитивами

Phaser SHALL отображать square bounding world `4400×4400`, одну arena circumference radius 2200,
background grid только внутри arena, распределённые внутри circle декоративные не участвующие в
collision примитивы, spaceship body, turret, shield arc и projectiles средствами Graphics/Shape без
bitmap assets. Область за circle SHALL оставаться более тёмным deep-space background. Active
battlefield SHALL занимать весь CSS viewport без card padding, border, фиксированной 16:9 рамки и
letterbox. Базовая logical view SHALL быть не меньше `1600×900`; при другом aspect ratio camera
SHALL расширять видимую область по одной оси без растяжения world/circle и без обрезания базовой
области. React HUD, room code и connection status SHALL быть overlays и SHALL NOT уменьшать Phaser
viewport.

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

### Requirement: Display интерполирует, но не владеет состоянием

Display SHALL хранить previous/latest authoritative snapshots и SHALL вычислять визуальные
spaceship/turret/shield/projectile transforms как функцию snapshot ticks и render delta, а не
фиксированного процента на frame. При 60 Hz и 120 Hz одинаковая пара snapshots SHALL давать
эквивалентную position trajectory по elapsed time с tolerance 0.01 world unit и angular trajectory с
tolerance 0.001 rad. Display SHALL корректироваться к server position и angle за 50 ms. Turret и
shield angle SHALL интерполироваться по кратчайшей дуге с canonical wrap через ±π. Display SHALL NOT
создавать trusted projectile, energy, velocity, angular target или cooldown самостоятельно. Только
первый snapshot, новый projectile и hydration MAY начинаться непосредственно с authoritative
transform.

#### Scenario: Локальная позиция расходится

- **WHEN** display получает positions и angles для соседних 50 ms ticks и рисует несколько кадров
  между ними
- **THEN** визуальный объект проходит промежуточные positions и angles вместо ожидания следующего
  patch и достигает authoritative transform за 50 ms

#### Scenario: Частота кадров различается

- **WHEN** один display рисует position и angular trace при 60 Hz, а другой при 120 Hz
- **THEN** их positions в одинаковый elapsed time отличаются не более чем на 0.01 world unit, а
  angles — не более чем на 0.001 rad

#### Scenario: Display переподключается

- **WHEN** reconnect получает актуальный snapshot во время authoritative traverse
- **THEN** scene сбрасывает interpolation buffer к current server position и angle, пересоздаёт
  projectiles без проигрывания пропущенных inputs, а следующие snapshots снова интерполируются

#### Scenario: Угол проходит через wrap

- **WHEN** соседние authoritative angles находятся по разные стороны границы `π/-π`
- **THEN** visual turret и shield проходят короткую дугу без почти полного оборота

### Requirement: Выключенный щит сохраняет видимое направление

Display SHALL рисовать shield arc по текущему авторитетному интерполированному angle независимо от
active-state и energy. Активный щит SHALL быть яркой синей дугой толщиной 16 и opacity 0.9;
выключенный, включая energy=0, SHALL быть тонкой приглушённой дугой толщиной 6 и opacity 0.35, чтобы
показывать направление, но не выглядеть как действующая защита. Геометрия дуги SHALL оставаться
`angle ± 0.72 rad`.

#### Scenario: Щит выключен

- **WHEN** authoritative snapshot содержит shield `active=false` с ненулевым angle
- **THEN** display показывает тонкую полупрозрачную дугу с этой стороны корабля

#### Scenario: Щит включён

- **WHEN** authoritative snapshot меняет shield на `active=true`
- **THEN** та же дуга становится толстой ярко-синей без изменения авторитетного направления

### Requirement: Display показывает authoritative space combat примитивами

Phaser SHALL создавать primitive visual по stable entity ID для enemy ships, asteroids, friendly и
hostile bullets и homing missiles. Existing object SHALL обновляться/interpolate in place, а
authoritative removal SHALL удалить visual. React HUD SHALL показывать spaceship HP, wave, score,
encounter phase и intermission countdown. Display SHALL NOT рассчитывать homing, collision, damage,
death, reward либо upgrade result.

#### Scenario: Gunship появился

- **WHEN** display snapshot впервые содержит enemy с новым stable ID
- **THEN** Phaser создаёт один отличимый primitive и последующие snapshots двигают тот же object

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
- **THEN** первый snapshot snaps к current spaceship/entities/HP, а следующий tick снова
  интерполируется без проигрывания пропущенных collisions

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

### Requirement: Камера следует за spaceship

Camera SHALL следовать за визуально интерполированной spaceship position. Phaser scroll SHALL
учитывать renderer pixels, zoom и фактический responsive logical viewport, чтобы spaceship оставался
в центре вне edge zone. Presentation-only camera bounds SHALL использовать square bounding envelope
круга и расширяться на overscan `spaceship.radius + 42 + 160/zoom` world units. В любой достижимой
core position spaceship body, turret и shield arc SHALL оставаться полностью видимыми и не ближе 160
CSS pixels к viewport edge; у arena circumference viewport MAY показать ограниченный outside-space.
Circular grid и obstacles SHALL визуально прокручиваться относительно viewport. World transforms
SHALL сохранять дробные coordinates без принудительного pixel rounding.

#### Scenario: Spaceship летит вправо

- **WHEN** authoritative snapshots публикуют возрастающие x и x-velocity
- **THEN** camera scroll изменяется промежуточными дробными positions без скачка на каждый server
  tick

#### Scenario: Spaceship у края мира

- **WHEN** spaceship находится на cardinal либо diagonal legal boundary position при произвольном
  поддерживаемом aspect ratio
- **THEN** camera учитывает renderer/zoom, показывает ограниченный background за circle и оставляет
  весь spaceship/turret/shield минимум в 160 CSS pixels от viewport edge без дрожания

#### Scenario: Camera использует zoom

- **WHEN** renderer `1920×1080` показывает logical viewport `1600×900` и spaceship находится в
  центре arena `(2200,2200)`
- **THEN** camera midpoint совпадает с spaceship, а world-view top-left равен `(1400,1750)` без
  систематического сдвига из-за zoom

### Requirement: Display показывает authoritative нагрев носового пулемёта

Боевой React HUD SHALL показывать текущие `heat`, `capacity` и `overheated` носового пулемёта только
из последнего authoritative display snapshot. Шкала SHALL безопасно ограничиваться диапазоном 0–100%
даже при некорректной нулевой capacity и SHALL иметь заметное красное состояние с текстом
«ПЕРЕГРЕВ», когда `overheated=true`. Display SHALL NOT моделировать нагрев или охлаждение локально.

#### Scenario: Пулемёт нагрет частично

- **WHEN** snapshot содержит `heat=40`, `capacity=100`, `overheated=false`
- **THEN** главный display показывает шкалу 40% и значение `40 / 100` без состояния перегрева

#### Scenario: Пулемёт перегрет

- **WHEN** snapshot содержит `overheated=true`
- **THEN** главный display выделяет индикатор красным и показывает текст «ПЕРЕГРЕВ»

#### Scenario: Display переподключился во время охлаждения

- **WHEN** после reconnect либо нового run первый snapshot содержит актуальное состояние пулемёта
- **THEN** HUD сразу показывает это состояние и не воспроизводит пропущенное охлаждение локально

### Requirement: Display показывает круглый обзорный радар всей арены

Боевой React HUD SHALL показывать круглую полупрозрачную north-up мини-карту, на которой вся
authoritative круглая arena целиком вписана без растяжения. Координаты SHALL проецироваться из
`worldWidth`, `worldHeight` и `arenaRadius`; содержимое за окружностью SHALL обрезаться круглой
маской. Радар SHALL показывать один общий корабль экипажа бирюзовым маркером и enemy ships красными.
Asteroids, homing missiles и обычные friendly/hostile projectiles SHALL NOT показываться. Маркеры
SHALL создаваться, обновляться и удаляться по текущему snapshot без локального предсказания
gameplay.

#### Scenario: Вся арена показана на радаре

- **WHEN** корабль и угрозы находятся в разных точках круглой арены
- **THEN** радар сохраняет их относительное положение внутри круглой north-up проекции всей арены

#### Scenario: Враг исчез из snapshot

- **WHEN** следующий authoritative snapshot больше не содержит enemy ID
- **THEN** соответствующий маркер отсутствует на мини-карте

#### Scenario: Враг находится за круглой границей

- **WHEN** позиция enemy находится за `arenaRadius`
- **THEN** его маркер обрезается круглой маской и не рисуется поверх рамки радара

#### Scenario: В snapshot есть ракеты и астероиды

- **WHEN** authoritative snapshot содержит homing missiles и asteroids
- **THEN** радар не создаёт для них маркеры

#### Scenario: Display переподключился

- **WHEN** reconnect либо новый run публикует первый актуальный snapshot
- **THEN** радар сразу соответствует его позициям и не проигрывает пропущенные перемещения

### Requirement: Боевой радар сохраняет читаемость HUD

Display SHALL показывать один радар снизу по центру поверх Phaser viewport и над основным combat
HUD. Он SHALL не изменять размер canvas и SHALL учитывать safe area телевизора. Его размер SHALL
быть адаптивным, форма SHALL оставаться круглой на поддерживаемых aspect ratio, а полупрозрачный
фон, рамка и маркеры SHALL оставаться различимыми поверх космоса. Радар SHALL NOT перекрывать нижний
combat HUD, room status и ping участников.

#### Scenario: Display меняет размер

- **WHEN** viewport меняется между `1920×1080`, `1366×768` и `1024×768`
- **THEN** радар остаётся кругом, расположен снизу по центру, целиком виден в safe area и не
  уменьшает Phaser viewport

### Requirement: Display показывает срок волны и точную причину поражения

Во время combat общий display SHALL показывать минуты и секунды до authoritative wave deadline. При
timeout result display SHALL явно сообщать «Время волны истекло», а при уничтожении hull SHALL
сохранять сообщение об уничтожении корабля.

#### Scenario: Экипаж видит countdown

- **WHEN** display показывает активную combat wave
- **THEN** HUD содержит номер волны и server-authoritative время до её провала

#### Scenario: Волна провалена по времени

- **WHEN** display получает frozen defeat с `defeatReason=wave_timeout`
- **THEN** result overlay показывает причину timeout, итоговую волну, счёт и готовность к rematch
