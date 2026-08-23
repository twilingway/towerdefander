---
name: realtime-game-contract
description:
  Design and review SpaceShip Defender realtime multiplayer contracts. Use when changing Colyseus
  rooms, shared messages, game-core simulation, room lifecycle, shared economy, reconnect, command
  idempotency, state visibility, protocol versions, or display/controller synchronization.
---

# Realtime Game Contract

Protect the server-authoritative boundary and ensure every client can reconnect and interpret shared
state safely.

## Contract workflow

1. Identify the actor, intent, authoritative handler, state mutation, recipients, and observable
   result.
2. Define or update message and state types in `packages/protocol`.
3. Validate untrusted input at the server boundary.
4. Apply trusted mutations only in the server or pure `packages/game-core` functions.
5. Specify compatibility, reconnect, duplicate delivery, ordering, and failure behavior.
6. Add deterministic unit tests and room-level tests before wiring UI behavior.
7. Verify controllers receive only required state and cannot mutate trusted state.

## Invariants

- Every resource-spending command includes `actionId`, `playerId`, `roomId`, and a protocol version.
  The server deduplicates `actionId`.
- Shared resource updates are atomic and resource-spending commands are idempotent.
- The server owns simulation time, random seed, health, damage, rewards, cooldowns, and win/lose
  decisions.
- The display interpolates authoritative state but does not invent trusted outcomes.
- Controllers send intents and receive compact public/player views.
- Reconnect uses a resumable identity with an expiry or grace period.
- Breaking changes increment the protocol version and define mismatch behavior.
- Pure simulation tests use explicit time steps and seeded randomness.

## Review output

Report violations by severity. Include the affected field, failure scenario, and the smallest
contract or test change needed to resolve it.
