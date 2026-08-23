## Context

Production уже является top-down space combat про один объект и три роли, но vocabulary остался от
двух прежних концепций: classic `Town Defenders` и `Flying Castle`. Legacy tokens находятся в npm
scope, room type, public snapshot path, core/server/display symbols, storage keys, filenames, tests,
current specs и UI. Простое изменение title оставит более опасную смесь на realtime boundary.

Change является cross-cutting rename без нового gameplay. Он также фиксирует product north star:
SpaceShip Defender — wave-defense с одним развиваемым кораблём; credits и покупки во время боя, как
и финальный art pass, реализуются отдельно.

## Goals / Non-Goals

**Goals:**

- единый brand `SpaceShip Defender` и code spelling `Spaceship`/`spaceship`;
- protocol v10, `spaceship_defender`, `game.spaceship`, `PublicSpaceshipView`;
- полное production API/file/package rename без compatibility aliases;
- численно неизменный deterministic gameplay и прежние authority/visibility guarantees;
- удаление неиспользуемого classic tower-defense core, canonical legacy capabilities и castle art;
- актуальные README, AGENTS, project plan, OpenSpec context и визуальный north star.

**Non-Goals:**

- credits economy, combat purchase UI или перенос upgrade flow из intermission;
- новые враги, баланс, rules, persistence, trade/RPG/map systems;
- настоящий 3D, новый renderer, bitmap art, particles/shaders implementation;
- изменение GitHub repository name/remote либо локальной workspace directory;
- редактирование immutable `openspec/changes/archive/**` и Git history.

## Decisions

### 1. Brand и identifiers имеют один glossary

Пользовательский brand пишется `SpaceShip Defender` согласно принятому названию. TypeScript classes
и types используют нормативную английскую форму `SpaceshipDefenderRoom`, `SpaceshipState`,
`SpaceshipSimulationConfig`; variables/fields/files — `spaceship`, npm/transport slugs —
`spaceship-defender`/`spaceship_defender`.

Альтернатива `SpaceShip*` в code отклонена: необычная внутренняя capitalisation быстро создаёт смесь
`SpaceShip`, `Spaceship` и `spaceShip` в generated/imported identifiers.

### 2. Realtime migration является hard cut v10

`PROTOCOL_VERSION` повышается до 10. Protocol экспортирует единственный
`ROOM_TYPE = "spaceship_defender"`. Public game shape меняет `castle` на `spaceship`; schema/type и
все adapters меняются атомарно. Server не регистрирует alias `town_defenders`, не публикует dual
fields и не принимает v9 envelopes.

Это pre-release проект, поэтому короткий compatibility layer дал бы больше путаницы, чем пользы.
Deployment требует остановить/дренировать существующие комнаты и одновременно обновить server,
display и controller. Reconnect storage получает новый key; legacy record удаляется до попытки
reconnect.

### 3. Rename идёт от core к consumers

Dependency order:

1. удалить unused `defense` module;
2. `flyingCastle.ts` → `spaceshipSimulation.ts`, все `castle*` state/config/API → `spaceship*`;
3. combat helpers/HP/targeting → spaceship vocabulary;
4. protocol v10 и package scope;
5. `SpaceshipDefenderState`/`SpaceshipDefenderRoom`, state reconciliation и room registration;
6. controller/display adapters, runtime, Canvas, test IDs и UI;
7. smoke/E2E/benchmarks/docs/tooling.

Temporary compatibility exports запрещены. Во время миграции отдельные package checks MAY быть
красными, но coherent dependency slices должны завершаться typecheck/tests до следующего слоя.

### 4. Simulation semantics не меняются

Mechanical mapping сохраняет значения config, field types, RNG domains, fixed-step order, collision
priority, entity caps и StateView ownership. Deterministic tests переименовываются вместе с API и
сохраняют прежние expected traces. Публичный shape меняет только names и version.

Credits и upgrades во время combat требуют idempotent resource commands, balance и UI decisions; они
не маскируются под rename.

### 5. Active specs очищаются, archives остаются историей

Новая canonical capability `spaceship-simulation` семантически заменяет `flying-castle-simulation`.
Delta явно удаляет все old requirements из этой capability и classic TD-only capabilities
(`cooperative-airstrike`, `deterministic-defense-loop`, `shared-defense-economy`,
`visual-battlefield-rendering`). OpenSpec 1.6 не допускает пустой canonical spec, поэтому archive
сначала применяет один retirement tombstone в каждом таком spec. После успешного apply
tombstone-only directories удаляются из active catalog как механическая часть того же archive
reconciliation; removed blocks, reason/migration и исходный текст сохраняются в архивном change/Git.

Остальные modified capabilities применяют полные requirement replacements и requirement renames.
OpenSpec 1.6 не имеет scenario-rename operation, поэтому восемь scenario heading-only renames
одинаково применяются к current canonical и delta до archive; их WHEN/THEN body и поведение не
меняются. Prettier MAY выполнить formatting-only normalization затронутых canonical Markdown без
semantic changes. Final scan исключает только archives и явный migration section этого change.

### 6. Visual direction пока является contract для следующего art pass

Текущий Phaser primitive renderer сохраняется. Current docs и product identity фиксируют
оригинальный 2D pseudo-3D корабль, layered cosmic depth/parallax и budgeted particles/shaders.
Референс на «Космических Рейнджеров» трактуется только как ощущение глубокого космоса, не как
копирование assets, карты, интерфейса, торговли или RPG.

Отдельный art change должен определить asset pipeline, shader fallbacks и Android TV performance
budget до добавления production assets/dependencies.

## Risks / Trade-offs

- **[Breaking deploy оставляет stale clients]** → v10 hard rejection, новый storage key,
  одновременный deploy и reload guidance.
- **[Механический rename меняет вычисление]** → preserve expected deterministic traces, core/room
  tests, network smoke и Playwright.
- **[Один legacy token остаётся в скрытом script/config]** → case-sensitive global scan по source,
  filenames и manifests с archive/migration allowlist.
- **[Удаление TD module задевает неизвестного consumer]** → workspace import scan, barrel API test и
  полный build; package не является published API.
- **[Protocol patch size случайно растёт]** → существующий 196-entity benchmark/patch test остаётся
  зелёным; rename не добавляет поля.
- **[Визуальная формулировка воспринимается как готовый art]** → project plan явно разделяет
  documented north star и последующий art implementation change.

## Migration Plan

1. Зафиксировать artifacts и strict validation.
2. Выполнить core/protocol/server/client/tooling rename по dependency order.
3. Обновить change deltas/current docs и удалить dead TD code/assets; current canonical specs не
   редактировать до archive apply, кроме одинаковых scenario heading-only renames, которые OpenSpec
   1.6 не умеет выразить отдельной operation.
4. Запустить package tests, `pnpm check`, network smoke, Playwright, benchmark и legacy scan.
5. Провести read-only reviewer pass и исправить blocker/high/medium findings.
6. После подтверждённого browser playtest архивировать change, применить traceable retirement
   deltas, удалить только tombstone-only legacy directories, повторить `pnpm spec:validate`, commit
   и push по отдельной команде пользователя.

Rollback: вернуть один rename commit и перезапустить согласованный v9 server/display/controller
набор; mixed v9/v10 deployment не поддерживается.

## Open Questions

Нет открытых решений, блокирующих refactor. Внешнее переименование GitHub repository/local folder,
credits economy/in-combat upgrades и art implementation остаются отдельными будущими решениями.
