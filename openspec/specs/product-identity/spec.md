# product-identity Specification

## Purpose

TBD - created by archiving change spaceship-defender-identity-refactor. Update Purpose after
archive.

## Requirements

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

### Requirement: Rename сохраняет server-authoritative gameplay

Переименование и circular migration SHALL NOT менять fixed-step timing, seeded RNG domains,
movement/rotation tuning, combat balance, roles, message ordering, idempotency,
reconnect/rematch/TTL либо StateView visibility, кроме явно принятой arena geometry/spawn/boundary
semantics. Одинаковые valid seed/input traces в v11 SHALL давать детерминированные numerical
outcomes.

#### Scenario: Детерминированный trace выполняется после rename

- **WHEN** core получает зафиксированные seed, circular config и sequence pilot/gunner/shield inputs
- **THEN** spaceship/enemies проходят повторяемые positions, shots, shield energy, damage, waves,
  score и result без несеянной случайности

#### Scenario: Полный browser flow работает с новым именем

- **WHEN** display и три controllers проходят join, movement, fire, shield, result и rematch
- **THEN** они остаются в одной `spaceship_defender` room, используют только v11 projections и не
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

### Requirement: Protocol v11 публикует spaceship contract

Strict protocol v11 SHALL использовать Colyseus room type `spaceship_defender`, общий exported
`ROOM_TYPE`, public fields `game.spaceship`/`game.arenaRadius` и schema/type `PublicSpaceshipView`.
Поле `game.castle`, старый room type и protocol v10 SHALL NOT приниматься server boundary. Display,
controllers, stats query и network scripts SHALL использовать один общий room type/protocol
contract.

#### Scenario: V10 display создаёт комнату

- **WHEN** display создаёт `spaceship_defender` с protocolVersion 11
- **THEN** server создаёт `SpaceshipDefenderRoom`, а strict snapshot содержит `game.spaceship`,
  `game.arenaRadius` и не содержит `game.castle`

#### Scenario: V9 клиент использует новый room type

- **WHEN** client создаёт, подключается либо отправляет gameplay message в `spaceship_defender` с
  protocolVersion 10
- **THEN** server возвращает `protocol_mismatch` до room/gameplay mutation

#### Scenario: Старый room type больше не зарегистрирован

- **WHEN** client пытается создать `town_defenders`
- **THEN** matchmaking завершается ошибкой без создания комнаты или gameplay state

#### Scenario: Старый reconnect token остался в browser storage

- **WHEN** controller v11 запускается с `spaceship-defender.controller-session.v1` либо legacy
  `town-defenders.controller-session.v1`
- **THEN** оба old records удаляются до `Client.reconnect`, новый join form не пытается восстановить
  v10 connection и v11 session сохраняется под `spaceship-defender.controller-session.v2`
