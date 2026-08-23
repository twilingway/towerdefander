## ADDED Requirements

### Requirement: Активный продукт имеет единое имя SpaceShip Defender

Пользовательские интерфейсы, production modules, package manifests, scripts, tests и актуальная
документация SHALL использовать brand `SpaceShip Defender`. Code identifiers SHALL использовать
нормальную английскую форму `Spaceship`, transport/storage slugs SHALL использовать `spaceship`, а
npm scope SHALL быть `@spaceship-defender/*`. Legacy names `Town Defenders`, `TownDefenders`,
`town_defenders`, `@town-defenders`, `Flying Castle`, `FlyingCastle`, `flyingCastle` и
castle-prefixed gameplay identifiers SHALL отсутствовать вне immutable OpenSpec archives и явно
обозначенной migration history.

#### Scenario: Разработчик ищет legacy runtime names

- **WHEN** repository scan исключает `openspec/changes/archive/**` и migration history
- **THEN** active source, filenames, package manifests, tests и current docs не содержат legacy
  product/simulation identifiers

#### Scenario: Пользователь открывает display и controller

- **WHEN** страницы загружены до или после подключения к комнате
- **THEN** titles, headings, status messages и accessibility labels называют игру
  `SpaceShip Defender`, а управляемый объект — космическим кораблём

### Requirement: Protocol v10 публикует spaceship contract

Strict protocol v10 SHALL использовать Colyseus room type `spaceship_defender`, общий exported
`ROOM_TYPE`, public field `game.spaceship` и schema/type `PublicSpaceshipView`. Поле `game.castle`,
старый room type и protocol v9 SHALL NOT приниматься server boundary. Display, controllers, stats
query и network scripts SHALL использовать один общий room type contract.

#### Scenario: V10 display создаёт комнату

- **WHEN** display создаёт `spaceship_defender` с protocolVersion 10
- **THEN** server создаёт `SpaceshipDefenderRoom`, а strict snapshot содержит `game.spaceship` и не
  содержит `game.castle`

#### Scenario: V9 клиент использует новый room type

- **WHEN** client создаёт либо подключается к `spaceship_defender` с protocolVersion 9
- **THEN** server возвращает `protocol_mismatch` до room/gameplay mutation

#### Scenario: Старый room type больше не зарегистрирован

- **WHEN** client пытается создать `town_defenders`
- **THEN** matchmaking завершается ошибкой без создания комнаты или gameplay state

#### Scenario: Старый reconnect token остался в browser storage

- **WHEN** controller v10 запускается с legacy `town-defenders.controller-session.v1`
- **THEN** legacy record удаляется до reconnect, новый join form не пытается восстановить v9
  connection и v10 session сохраняется под новым key

### Requirement: Rename сохраняет server-authoritative gameplay

Переименование SHALL NOT менять fixed-step timing, seeded RNG, movement/rotation tuning, combat
balance, roles, message ordering, idempotency, reconnect, rematch, TTL либо StateView visibility.
Одинаковые valid seed/input traces до и после механической миграции SHALL давать эквивалентные
числовые gameplay outcomes с renamed fields.

#### Scenario: Детерминированный trace выполняется после rename

- **WHEN** core получает зафиксированные seed, config и sequence pilot/gunner/shield inputs
- **THEN** spaceship проходит прежние positions, shots, shield energy, damage, waves, score и result
  без изменения настроечных значений

#### Scenario: Полный browser flow работает с новым именем

- **WHEN** display и три controllers проходят join, movement, fire, shield, result и rematch
- **THEN** они остаются в одной `spaceship_defender` room, используют только v10 projections и не
  требуют legacy compatibility aliases

### Requirement: Product north star отделён от текущего refactor

Актуальная документация SHALL описывать продукт как top-down space wave-defense с одним развиваемым
кораблём, где уничтожение волн приносит credits для модернизации корпуса, щитов и оружия
непосредственно во время боя. Этот refactor SHALL NOT выдумывать credits economy, combat purchase
rules или перенос существующего intermission upgrade flow; behavioral implementation SHALL быть
отдельным accepted change.

#### Scenario: Разработчик планирует economy этап

- **WHEN** он читает current project plan и specs после rename
- **THEN** credits и in-combat modernization видны как следующий gameplay change, а текущие score и
  intermission upgrades честно описаны как существующее поведение

### Requirement: Визуальный профиль создаёт ощущение глубокого космоса без 3D

Art direction SHALL ориентироваться на оригинальный 2D pseudo-3D корабль, многослойные глубокие
космические backgrounds, parallax, modern particles и shaders. Проект SHALL NOT требовать настоящий
3D renderer, карту/навигацию по образцу «Космических Рейнджеров», торговлю или RPG и SHALL NOT
копировать чужие assets. Текущий primitive renderer MAY оставаться до отдельного accepted art pass.

#### Scenario: Планируется следующий visual pass

- **WHEN** команда выбирает background, ship art и effects
- **THEN** proposal оценивает depth/parallax/particles/shaders в 2D и Android TV budget, не добавляя
  3D, торговую карту либо RPG systems
