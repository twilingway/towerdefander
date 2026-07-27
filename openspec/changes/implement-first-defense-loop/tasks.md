## 1. Deterministic game core

- [x] 1.1 Define validated defense config, state, sector, enemy, result, and action types; verify
      with `pnpm --filter @town-defenders/game-core typecheck`.
- [x] 1.2 Implement deterministic state creation and fixed-step spawn/move/automatic-attack
      transitions; verify with known-sequence unit tests.
- [x] 1.3 Implement terminal victory/defeat and immutable terminal states; verify with game-core
      unit tests.
- [x] 1.4 Implement atomic repair/upgrade transitions and business rejection reasons; verify with
      economy and insufficient-funds unit tests.

## 2. Protocol and authoritative server

- [ ] 2.1 Raise the protocol version and define strict game snapshot, repair/upgrade command, and
      error schemas; verify with protocol runtime-schema tests.
- [ ] 2.2 Extend Colyseus state with assigned sectors and the public game snapshot; verify schema
      mapping with server tests.
- [ ] 2.3 Start exactly one room-owned fixed-step scheduler, advance game-core, and finish the room
      on victory/defeat; verify lifecycle tests with fake timers.
- [ ] 2.4 Route repair/upgrade through room/player identity, phase, ownership, funds, and a
      room-wide accepted/rejected action-result journal; verify atomicity and replay tests.
- [ ] 2.5 Preserve active-game identity and snapshot across controller/display reconnect; verify
      room and network smoke tests.

## 3. Browser clients

- [ ] 3.1 Replace display signal count with a readable two-sector battlefield, treasury, health,
      defense, enemies, and result view; verify component tests and production build.
- [ ] 3.2 Replace controller signal action with own-sector repair/upgrade controls and
      server-confirmed feedback; verify component and interaction tests.
- [ ] 3.3 Keep lobby, protocol mismatch, reconnect, unavailable-action, and insufficient-funds
      errors usable on phone and desktop layouts; verify browser E2E.

## 4. Integrated verification

- [ ] 4.1 Extend network smoke through room start, both action types, duplicate delivery, reconnect,
      and terminal result.
- [ ] 4.2 Extend Playwright E2E so two isolated controllers complete a short deterministic match.
- [ ] 4.3 Run `pnpm check` and `pnpm spec:validate`, complete reviewer-agent reconciliation, and
      archive the change.
