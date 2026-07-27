## 1. Wave simulation

- [x] 1.1 Define deterministic wave, enemy archetype, boss, intermission, and cooperative ability
      configuration and state types in `game-core`.
- [x] 1.2 Implement the five-wave state machine with ten-second intermissions, combat progression,
      victory, and defeat.
- [x] 1.3 Implement balanced, fast, heavy, and boss enemies with configurable health, speed, gate
      damage, and rewards.
- [x] 1.4 Implement shared airstrike charge gain, validation, deterministic damage, and charge
      reset.

Verification: `pnpm.cmd --filter @town-defenders/game-core test` covers wave boundaries, config
rejection, archetypes, the single boss, spend-before-recharge airstrike ordering, and empty targets.

## 2. Realtime contract and server

- [x] 2.1 Bump the protocol to version 3 and add schemas for wave state, typed enemies, airstrike
      charge, `{ sequence, actionId, playerId, targetSectorId, appliedTick }` effects, and the
      airstrike command envelope.
- [x] 2.2 Extend the Colyseus room schema and public snapshot mapper without leaking server-only
      simulation state.
- [x] 2.3 Route airstrike commands through the existing authoritative action journal with idempotent
      accepted and rejected outcomes.
- [x] 2.4 Preserve the current wave, stage, charge, entities, and result through disconnect and
      reconnect.

Verification: `pnpm.cmd --filter @town-defenders/protocol test` validates strict v3 runtime schemas;
`pnpm.cmd --filter @town-defenders/server test` covers the fake scheduler, journal replay, lost
accepted outcome, effect sequence, identity, phase, and reconnect.

## 3. Visual display

- [x] 3.1 Add a client-only Phaser lifecycle bridge that creates one game instance and accepts
      immutable authoritative snapshots from React.
- [x] 3.2 Draw a responsive landscape battlefield with two roads, gates, towers, sector ownership,
      and ambient background details.
- [x] 3.3 Reconcile enemy display objects by identifier and visualize archetype, health, lane
      progress, death, and breach.
- [x] 3.4 Add cosmetic tower projectiles, hit flashes, hydration-safe airstrike effects,
      intermission presentation, and boss emphasis without affecting simulation.
- [x] 3.5 Keep React responsible for lobby, wave HUD, treasury, shared airstrike charge, connection
      state, and accessible text fallback.

Verification: `pnpm.cmd --filter @town-defenders/display test` covers create/destroy once, enemyId
add/update/remove, responsive snapshot reconciliation, and first-snapshot effect baseline.

## 4. Player controller

- [x] 4.1 Show the current wave, stage, intermission countdown, shared charge, and both sectors on
      the controller.
- [x] 4.2 Add airstrike targeting for the player's own or neighboring sector and disable it until
      the authoritative state permits use.
- [x] 4.3 Surface accepted and rejected ability outcomes and preserve controller state through
      reconnect.

Verification: `pnpm.cmd --filter @town-defenders/controller test` covers v3 mapping, airstrike
target selection, disabled states, typed errors, and reconnect hydration.

## 5. Verification and delivery

- [x] 5.1 Add deterministic `game-core`, protocol, and server tests for all waves, archetypes, boss,
      charge, airstrike, idempotency, and reconnect.
- [x] 5.2 Extend the real-network smoke test through wave progression and a cooperative airstrike.
- [x] 5.3 Extend Playwright coverage for the Phaser canvas, visual enemy reconciliation, controller
      targeting, and final match result.
- [x] 5.4 Run `pnpm check`, validate the OpenSpec change, complete the reviewer pass, update
      documentation, and archive the change.

Verification: `pnpm.cmd check` and `pnpm.cmd spec:validate` pass; Playwright treats the canvas as a
smoke/integration check while lifecycle and reconciliation remain unit-tested.
