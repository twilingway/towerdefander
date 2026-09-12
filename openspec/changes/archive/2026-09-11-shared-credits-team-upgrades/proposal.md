## Why

Текущие upgrades бесплатны, выдаются отдельно каждой роли за короткие 10 секунд и имеют UI-дефект:
отклонённый server command может навсегда оставить карточку pending. Нужна общая экономика, в
которой очки остаются результатом забега, а экипаж совместно решает, какой одной роли купить
улучшение.

## What Changes

- `score` остаётся нетратимым результатом run. Сбитые либо перехваченные щитом ракеты дают 5 очков,
  астероиды — 10 очков; server начисляет reward один раз.
- Добавляется общий баланс `credits`, сбрасываемый только новым run/rematch. Wave asteroid даёт 1,
  gunship 2, missile carrier 4 credits; ambient asteroid и ракета не дают credits.
- Intermission увеличивается с 200 до 600 fixed ticks — 30 секунд.
- Три бесплатных role-specific выбора заменяются одним общим платным upgrade за intermission:
  одинаковый offer содержит по одной карте pilot/gunner/shield с базовой ценой 5 credits.
- Каждый role slot имеет изменяемый голос. На deadline выигрывает большинство; при ничьей действует
  стабильный порядок опубликованных карт. Без голосов либо при недостаточном балансе покупка
  пропускается, credits переносятся дальше.
- Server атомарно и идемпотентно фиксирует голоса, списывает credits один раз и применяет ровно один
  modifier. Reconnect восстанавливает голос; replacement наследует role vote и может его изменить.
- Display и все controllers показывают score, credits, общий offer, цену и голоса. UI снимает
  pending после accepted state либо actor-only server error.
- **BREAKING**: protocol v13 повышается до v14; server/display/controllers выкатываются вместе.

Не входит в change: постоянный meta-progression, персональные кошельки, продажа upgrades,
динамические цены/tier balance, leaderboard persistence и покупки непосредственно во время combat.

## Capabilities

### New Capabilities

- `shared-credits-economy`: authoritative rewards, общий баланс и атомарная покупка командного
  upgrade.

### Modified Capabilities

- `role-roguelite-upgrades`: общий 30-секундный paid vote вместо трёх бесплатных выборов.
- `spaceship-simulation`: отдельные score/credits rewards и применение одного победившего modifier.
- `shared-room-session`: protocol v14, reconnect votes и общий economy projection.
- `primitive-top-down-battlefield`: display показывает credits, offer и ход голосования.
- `three-role-controls`: controllers показывают общий offer, позволяют менять голос и получают явный
  accepted/error feedback.

## Impact

- `packages/protocol`: v14 schemas/messages/projections.
- `packages/game-core`: deterministic credits, scoring interception и team-upgrade resolution.
- `apps/server`: authorization, idempotency journal, StateView и synchronization.
- `apps/display`, `apps/controller`: общий economy HUD и voting UX.
- Network smoke, unit tests и Playwright получают полный wave 1 → purchase → wave 2 сценарий.
