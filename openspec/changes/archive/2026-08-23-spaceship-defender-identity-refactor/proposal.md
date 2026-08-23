## Why

Текущий код и документация одновременно используют `Town Defenders`, `Flying Castle` и актуальную
космическую механику, из-за чего public contract, имена файлов и product language противоречат друг
другу. Проект получает единое имя **SpaceShip Defender** и однозначную модель одного развиваемого
космического корабля до начала следующего gameplay/art этапа.

## What Changes

- **BREAKING** Переименовать product/runtime identity в `SpaceShip Defender`: npm namespace
  `@spaceship-defender/*`, Colyseus room route `spaceship_defender`, server `SpaceshipDefenderRoom`
  и `SpaceshipDefenderState`, core `Spaceship*` API, display runtime, UI labels, test IDs, storage
  keys, scripts и документацию.
- **BREAKING** Поднять protocol v9 до v10 и заменить public `castle`/`PublicCastleView` на
  `spaceship`/`PublicSpaceshipView`; v9 clients и старый room route больше не поддерживаются.
- Переименовать `flyingCastle` modules/files/types/functions/state/config fields в `spaceship`
  terminology без изменения server-authoritative simulation, ролей, rematch или combat balance.
- Удалить неиспользуемый classic tower-defense core и его production-era canonical specs/assets,
  сохранив архивные OpenSpec changes и Git history без переписывания.
- Обновить product direction: top-down space wave-defense с одним развиваемым кораблём, credits и
  модернизацией корпуса, щитов и оружия непосредственно в бою.
- Зафиксировать визуальное направление: оригинальный 2D pseudo-3D art, глубокие многослойные
  космические backgrounds и современные particles/shaders. Настоящий 3D, карта в стиле «Космических
  Рейнджеров», торговля и RPG не входят в продуктовый профиль.
- Не добавлять dependency, новую игровую механику credits/upgrades либо финальный art в этом
  rename-refactor; они получат отдельные behavioral changes.

## Capabilities

### New Capabilities

- `product-identity`: единое имя продукта, v10 wire/room identity, отсутствие legacy runtime
  terminology и утверждённые product/art границы.
- `spaceship-simulation`: текущее server-authoritative движение, оружие, щит и combat state,
  перенесённые из legacy `flying-castle-simulation` в ship terminology без изменения поведения.

### Modified Capabilities

- `shared-room-session`: запуск комнаты и strict projections переходят на protocol v10,
  `spaceship_defender` и `game.spaceship` state.
- `primitive-top-down-battlefield`: shared display показывает космический корабль и сохраняет
  render-only authority при новом именовании и visual direction.
- `authoritative-space-combat`: HP, targeting, collision и defeat используют spaceship terminology
  без изменения combat rules.
- `three-role-controls`: роли управляют одним spaceship, сохраняя текущие intents и reconnect.
- `run-rematch-lifecycle`: terminal result и clean rematch сбрасывают spaceship state без изменения
  lifecycle/TTL правил.
- `flying-castle-simulation`: legacy requirements заменяются retirement marker и мигрируют в
  `spaceship-simulation`.
- `cooperative-airstrike`: classic TD-only retirement marker удаляется из active catalog.
- `deterministic-defense-loop`: classic TD-only retirement marker удаляется из active catalog.
- `shared-defense-economy`: classic TD-only retirement marker удаляется из active catalog.
- `visual-battlefield-rendering`: classic TD-only retirement marker удаляется из active catalog.

## Impact

- Затронуты все workspaces, `packages/protocol`, `packages/game-core`, Colyseus server,
  display/controller adapters, tests, smoke/E2E, stats query, README, AGENTS и OpenSpec context.
- Deployment требует одновременного обновления server/display/controller; существующие v9 комнаты не
  мигрируют и создаются заново после reload.
- Внешнее имя GitHub repository и локальной workspace-папки не меняется автоматически: это отдельная
  внешняя операция, не требуемая для корректности source tree.
- Архивные changes остаются неизменными и могут содержать прежние имена как исторические записи.
