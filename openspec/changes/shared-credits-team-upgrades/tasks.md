## 1. Protocol и pure core

- [x] 1.1 Повысить protocol до v14: economy projection, team offer/votes/selection и strict
      idempotent `upgrade:vote`; проверить protocol tests.
- [x] 1.2 Добавить в pure core credits/reward table, включая projectile/shield score для missiles и
      asteroids с защитой от double reward; проверить deterministic combat tests.
- [x] 1.3 Заменить personal free offers на общий offer, 600-tick vote и атомарный paid resolution;
      проверить tie/no-vote/insufficient/reconnect-role semantics core tests.

## 2. Authoritative room

- [x] 2.1 Обновить Colyseus schema/sync и v14 projections для score, credits, offer, votes и
      selection.
- [x] 2.2 Реализовать authorization, revision и bounded action journal для `upgrade:vote`, включая
      duplicate/conflict/stale/reconnect/replacement tests.
- [x] 2.3 Обновить network smoke: wave 1 → votes → single debit/modifier → wave 2.

## 3. Client UX

- [x] 3.1 Обновить display HUD/intermission overlay для score, credits, cards и public votes;
      проверить display tests/build.
- [x] 3.2 Заменить controller personal UpgradePanel на shared voting UI с pending reset после
      authoritative error; проверить controller tests/build.
- [x] 3.3 Добавить Playwright browser click flow трёх controllers и доказательство modifier/balance
      в wave 2.

## 4. Документация и verification

- [x] 4.1 Обновить GDD, README и PROJECT_PLAN для score/credits/voting/30-second intermission.
- [x] 4.2 Выполнить `pnpm check`, `pnpm spec:validate` и согласовать выполненные tasks.
- [ ] 4.3 Провести read-only reviewer audit authority, atomic spend, idempotency, reconnect и UI без
      blocker/high/medium findings.
