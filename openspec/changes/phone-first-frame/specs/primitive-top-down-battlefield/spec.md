## MODIFIED Requirements

### Requirement: Display показывает top-down мир примитивами

Phaser SHALL отображать square bounding world `4400×4400`, одну arena circumference radius 2200,
background grid только внутри arena, распределённые внутри circle декоративные не участвующие в
collision примитивы, spaceship body, turret, shield arc и projectiles средствами Graphics/Shape без
bitmap assets. Область за circle SHALL оставаться более тёмным deep-space background. Active
battlefield SHALL занимать весь CSS viewport без card padding и border. Кадр мира SHALL иметь
пропорцию `19.5:9`: ширина равна authoritative `cameraViewWidth` из display-проекции снапшота,
высота — `9/19.5` от неё. Каждое устройство SHALL показывать эту высоту мира целиком без растяжения
world/circle. Экран уже 19.5:9 SHALL показывать ровно кадр с полосами сверху и снизу. Экран шире
19.5:9 SHALL показывать больше мира по бокам без полос, пока его пропорция не шире `21:9`; экран
шире `21:9` SHALL показывать участок `21:9` с полосами по бокам. Сервер и боты SHALL видеть базовый
кадр 19.5:9 независимо от экранов игроков. Изменение authoritative кадра SHALL перенастраивать
camera без пересоздания Room/runtime. React HUD, room code и connection status SHALL быть overlays и
SHALL NOT уменьшать Phaser viewport.

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
  arena остаётся кругом и участок мира 19.5:9 виден целиком

#### Scenario: Телефон 19.5:9 без полос

- **WHEN** display открыт на экране `780×360` в ландшафте
- **THEN** кадр мира занимает весь экран без полос

#### Scenario: Монитор 16:9 и монитор 21:9

- **WHEN** один и тот же забег показан на `1920×1080` и на `3440×1440`
- **THEN** оба показывают одну высоту мира; на `1920×1080` видны полосы сверху и снизу, а
  `3440×1440` заполнен без полос и показывает по бокам больше мира

#### Scenario: Экран шире 21:9

- **WHEN** забег показан на `5120×1440`
- **THEN** экран показывает участок мира `21:9` той же высоты с узкими полосами по бокам

### Requirement: Камера следует за spaceship

Camera SHALL следовать за визуально интерполированной spaceship position и SHALL держать её в центре
viewport в любой достижимой core position, включая край арены. Phaser scroll SHALL учитывать
renderer pixels, zoom и фактический responsive logical viewport. Camera SHALL NOT ограничиваться
границами мира: остановленная камера оставляет неровность темпа снимков видимой на самом корабле,
тогда как едущая уносит её вместе с собой. У края арены viewport SHALL показывать пространство
снаружи круга. Circular grid и obstacles SHALL визуально прокручиваться относительно viewport. World
transforms SHALL сохранять дробные coordinates без принудительного pixel rounding.

#### Scenario: Spaceship летит вправо

- **WHEN** authoritative snapshots публикуют возрастающие x и x-velocity
- **THEN** camera scroll изменяется промежуточными дробными positions без скачка на каждый server
  tick

#### Scenario: Spaceship у края мира

- **WHEN** spaceship находится на cardinal либо diagonal legal boundary position при произвольном
  поддерживаемом aspect ratio
- **THEN** корабль остаётся в центре viewport, камера продолжает следовать за ним без остановки, а в
  кадре видно пространство снаружи круга

#### Scenario: Camera использует zoom

- **WHEN** renderer `1950×900` показывает logical viewport `1950×900` и spaceship находится в центре
  arena `(2200,2200)`
- **THEN** camera midpoint совпадает с spaceship, а world-view top-left равен `(1225,1750)` без
  систематического сдвига из-за zoom
