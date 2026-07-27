## 1. Project foundation

- [x] 1.1 Initialize Git, pnpm workspace, strict TypeScript, lint, format, test, and build root
      configuration; verify with `pnpm install`.
- [x] 1.2 Initialize OpenSpec, project rules, custom agents, and validated repo-scoped skills;
      verify with both skill validators and `pnpm spec list`.
- [x] 1.3 Create package manifests and TypeScript configs for display, controller, server, protocol,
      game-core, and shared config; verify with `pnpm typecheck`.

## 2. Shared protocol and core

- [x] 2.1 Define protocol version, roles, join options, messages, errors, and runtime schemas in
      `packages/protocol`; verify with protocol unit tests.
- [x] 2.2 Create the pure `packages/game-core` boundary and deterministic test harness without
      client or network dependencies; verify with game-core tests.

## 3. Authoritative room server

- [x] 3.1 Implement Colyseus room state, display creation, two-controller capacity, names, and
      ready/active transitions; verify with room tests.
- [x] 3.2 Implement validated `player:signal`, protocol mismatch errors, and `actionId`
      deduplication; verify with duplicate-delivery tests.
- [x] 3.3 Implement 30-second controller reconnection and expired-token behavior; verify with room
      lifecycle tests.
- [x] 3.4 Add health endpoint, environment configuration, LAN binding, and graceful shutdown; verify
      by starting the server and requesting health.

## 4. Browser clients

- [x] 4.1 Implement display room creation plus join URL and QR-code; verify URL construction and
      initial component rendering with unit tests.
- [x] 4.2 Implement display roster/phase rendering, connection-error state, and reserved Phaser
      container; verify with a production build and the network smoke test.
- [x] 4.3 Implement responsive controller room-code/name join and lobby state; verify with initial
      component and view-model tests.
- [x] 4.4 Implement controller ready, signal, confirmed-count, reconnect, and error flows; verify
      with reconnection-session tests, a production build, and the network smoke test.
- [x] 4.5 Add browser interaction tests for QR, roster, phase, ready, signal/count, reconnect, and
      error rendering.
- [x] 4.6 Ensure display and controller endpoints use LAN-safe configurable URLs; verify from a
      second browser/device hostname.
- [x] 4.7 Preserve display identity during a 30-second transient disconnect; verify with room and
      network integration tests.

## 5. Integrated verification

- [x] 5.1 Add a two-controller browser smoke test covering create, join, ready, active, and signal
      confirmation.
- [x] 5.2 Add reconnect and invalid/duplicate command integration checks.
- [x] 5.3 Run `pnpm check` and `pnpm spec:validate`, request reviewer-agent inspection, and
      reconcile all findings before marking the change complete.
