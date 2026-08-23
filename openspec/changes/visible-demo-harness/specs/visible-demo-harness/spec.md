## ADDED Requirements

### Requirement: Демонстрация запускается в видимом изолированном браузере

Команда `pnpm demo:visible` SHALL запускать local server/display на отдельных фиксированных ports,
открывать отдельный обычный процесс Google Chrome с временным owned profile, подключать Playwright
через CDP только для telemetry/bridge, показывать общий экран на переднем плане и создавать новую
комнату. Harness SHALL завершать только принадлежащие ему процессы и SHALL NOT подключаться к
существующей production room.

#### Scenario: Разработчик запускает демонстрацию

- **WHEN** разработчик выполняет `pnpm demo:visible`
- **THEN** появляется видимое окно Chrome, display создаёт room и показывает подключённый demo crew

#### Scenario: Port уже занят

- **WHEN** один из изолированных demo ports недоступен
- **THEN** harness завершается с понятной ошибкой и не закрывает посторонний процесс

### Requirement: Auto-crew использует обычный realtime contract

Harness SHALL подключать ровно три authenticated controller connections с ролями pilot, gunner и
shield. Auto-crew SHALL отправлять только current strict ready/input/upgrade commands с корректными
identity, runNumber и monotonic sequence; server/game-core SHALL оставаться единственными
владельцами positions, collisions, damage, wave и result.

#### Scenario: Бой начинается

- **WHEN** display room создана и три demo controller подключены
- **THEN** все три отправляют ready, run переходит в combat и display показывает движение, fire и
  shield actions

#### Scenario: Волна закончилась

- **WHEN** encounter переходит в intermission и каждой роли опубликован offer
- **THEN** harness выбирает одну valid card для каждой роли через `upgrade:choose`, после полного
  countdown начинается следующая wave

#### Scenario: Корабль уничтожен

- **WHEN** encounter публикует terminal result
- **THEN** после видимой паузы три роли отправляют current-run ready и тот же display показывает
  clean rematch с увеличенным runNumber

### Requirement: Display показывает управление демонстрацией

Demo URL SHALL показывать поверх арены dev-only overlay со статусом connection/phase/wave, текущим
сценарием и кнопками Pause/Resume/Stop. Overlay и target telemetry SHALL отсутствовать при обычном
display URL без demo query. Активация SHALL требовать одновременно development build, runner-only
`VITE_VISIBLE_DEMO=1` и demo query; production build с `?demo=1` SHALL не публиковать overlay или
telemetry.

#### Scenario: Production URL не включает demo-инструменты

- **WHEN** production display build открыт с `?demo=1`
- **THEN** overlay, bridge subscription и `data-demo-*` telemetry отсутствуют

#### Scenario: Пользователь ставит демонстрацию на паузу

- **WHEN** пользователь нажимает «Пауза автопилота»
- **THEN** harness сначала отключает scheduler и инвалидирует generation, затем отправляет neutral
  pilot vector, gunner firing false и shield OFF; после neutral sequence активные intents не
  отправляются до Resume, а server simulation, waves и damage продолжаются

#### Scenario: Пользователь останавливает демонстрацию

- **WHEN** пользователь нажимает Stop либо закрывает demo browser
- **THEN** владеющий SDK connections Node runner выполняет neutralization и consented controller
  leave, browser закрывается, owned local services завершаются и процесс возвращает успешный exit
  при штатном Stop

#### Scenario: Harness аварийно завершается

- **WHEN** browser, server или automation сообщает ошибку либо процесс получает Ctrl+C
- **THEN** harness нейтрализует доступные intents, закрывает owned connections/processes и выводит
  причину без бесконечных background processes

### Requirement: Видимая демонстрация показывает реальный cadence

Headed Chrome SHALL запускаться без native background/occlusion throttling. Dev-only overlay SHALL
показывать измеренные render FPS, authoritative snapshot Hz и auto-control Hz, рассчитанные по
реальному elapsed time. Метрики SHALL обновляться с ограниченной частотой и SHALL NOT менять
protocol, server simulation либо authoritative state. Круглая arena SHALL рисоваться без
неподдерживаемой Phaser WebGL GeometryMask.

#### Scenario: Пользователь наблюдает плавный бой

- **WHEN** headed demo находится на переднем плане и auto-crew ведёт combat
- **THEN** Phaser интерполирует snapshots на каждом animation frame, foreground render сохраняет не
  менее 30 FPS в обычных локальных условиях, overlay показывает snapshot/control cadence не менее 15
  Hz, а target cadence остаётся около 60/20/20

#### Scenario: Окно временно перекрыто

- **WHEN** другое окно перекрывает headed Chrome
- **THEN** native occlusion detection не переводит demo renderer в slideshow cadence, хотя реальный
  FPS MAY снижаться при нехватке ресурсов устройства

### Requirement: Видимая демонстрация не блокирует CI

Бесконечный headed demo SHALL запускаться только явной командой и SHALL NOT входить в `pnpm check`,
обычный `test:e2e` либо CI. Pure helpers и overlay SHALL иметь finite automated tests. Отдельная
команда `pnpm demo:verify` SHALL запускать тот же harness headless с bounded timeout и доказывать
observable movement, friendly projectile, active shield, intermission, три accepted upgrade и wave
2, а также ненулевые render/snapshot/control cadence diagnostics.

#### Scenario: Запускается стандартная проверка проекта

- **WHEN** выполняется `pnpm check`
- **THEN** visible demo не открывает GUI и не ожидает пользовательского Stop
