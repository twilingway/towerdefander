# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this
repository.

`AGENTS.md` holds the repository working agreements (product framing, boundaries, definition of
done) and applies here too. This file covers commands and architecture.

## Commands

Node 22+ and pnpm 10.34.5 (`corepack enable pnpm`). Copy `.env.example` to `.env.local` before
`pnpm dev`.

```bash
pnpm dev
```

Runs server (`:2567`), display (`:5173`), controller (`:5174`), and the balance console (`:5175`) in
parallel.

Full gate before declaring work complete — format, lint, typecheck, unit tests, build, network
smoke, Playwright e2e:

```bash
pnpm check
```

Narrower checks: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm format`.

Single test file or single case (works uniformly across packages; `pnpm --filter <pkg> test <args>`
does not, because some `test` scripts chain commands):

```bash
pnpm --filter @spaceship-defender/game-core exec vitest run src/combat.test.ts -t "shield"
```

Workspace names: `@spaceship-defender/{server,display,controller,admin,game-core,protocol}`.

| Command                                 | Purpose                                                                            |
| --------------------------------------- | ---------------------------------------------------------------------------------- |
| `pnpm test:e2e`                         | Builds the server, then Playwright `tests/e2e` on isolated ports 35678/35173/35174 |
| `pnpm smoke:network`                    | Headless Colyseus SDK client driving a real room (port 35677)                      |
| `pnpm demo:visible`                     | Opens real Chrome, three SDK auto-crew controllers play a run (ports 36567/36173)  |
| `pnpm demo:verify`                      | Headless assertion pass over the same demo; deliberately outside `pnpm check`      |
| `pnpm benchmark:combat`                 | Worst-case combat room stepping benchmark                                          |
| `pnpm spec list` / `pnpm spec:validate` | OpenSpec change status and validation                                              |

Every harness uses its own port block, so they can run while `pnpm dev` is up. `scripts/` spawns
child processes with `--import ./scripts/owned-process-guard.mjs` so stopping a harness kills only
processes it started — keep that guard when adding a harness.

## Architecture

Server-authoritative realtime game: `apps/server` (Colyseus) owns trusted state; display and
controllers send intents and render authoritative snapshots.

```text
apps/display    React shell + HUD, Phaser world (Phaser lives only here)
apps/controller React pilot/gunner/shield panels, touch + mouse + keyboard
apps/server     Colyseus room, lifecycle timers, /health, /stats/rooms, /admin/balance
apps/admin      React balance console: waves, enemy catalogue, director, camera frame
packages/protocol   zod schemas, message names, shared constants (source of truth)
packages/game-core  pure deterministic simulation
```

`protocol` and `game-core` export `./src/index.ts` directly — apps consume TypeScript source, and
only the server is bundled (tsup, `noExternal: game-core`).

### Simulation

`packages/game-core` is pure: no Phaser, React, DOM, networking, wall-clock timers, or unseeded
randomness. Randomness comes from `createSeededRandom(seed)`, time from `advanceClock`, and each
step is a pure `advanceSpaceshipSimulation(state, config) -> state`. `fixedStepMs` is validated to
be exactly `50` (20 Hz); the room drives it via `this.clock.setInterval` in `startSimulation()`.
Simulation tests step explicitly rather than waiting on timers.

### Server room

`apps/server/src/rooms/SpaceshipDefenderRoom.ts` is the whole authority surface:

- Every handler `safeParse`s its payload against a `packages/protocol` schema and answers failures
  with a `serverErrorCodeSchema` code — never trust a client payload shape.
- Continuous inputs (`pilot:input`, `gunner:input`, `shield:input`) carry a monotonic `sequence`;
  the room keeps per-client watermarks and drops stale/replayed messages.
- Resource-spending commands (`upgrade:vote`) carry `actionId` + `revision` and are deduplicated
  through a per-player upgrade journal, so retries after an error are safe.
- `SpaceshipDefenderState.ts` mirrors simulation state into `@colyseus/schema`; the `sync*` /
  `reconcileKeyed` helpers at the bottom of the room file do that mirroring by id.
- Display-only state is gated with `@view(1)` + per-client `StateView`, so controllers receive only
  what their panel needs.
- Lifecycle deadlines (lobby, wave, result, zero-controller, absolute room lifetime) come from
  `config.ts`/`.env.example` and dispose rooms with a `ROOM_CLOSING_REASONS` value. Disconnects go
  through `allowReconnection` with a grace period; consented leaves dispose immediately.

### Protocol and client views

`packages/protocol/src/index.ts` pins `PROTOCOL_VERSION` (currently 26) as a `z.literal` inside join
options and every command envelope, so any breaking change means bumping that constant and defining
mismatch behavior — clients then get `protocol_mismatch` instead of silent drift.
`packages/protocol/src/balance.ts` holds the balance schemas the console and the preset file share;
they carry their own `BALANCE_FILE_VERSION` (currently 7) with migrations in
`apps/server/src/balance/store.ts`, and a balance-only change bumps that file version instead of the
protocol.

Clients do not read Colyseus schema objects directly in UI code. `apps/display/src/roomView.ts`
(`toDisplayRoomView`) and `apps/controller/src/roomView.ts` (`toControllerRoomView`) flatten
`MapSchema`/`ArraySchema` into plain objects and run `displayRoomViewSchema.parse` /
`controllerRoomViewSchema.parse`. A protocol field change therefore usually touches four places:
protocol schema, server state + sync, both roomView adapters.

`apps/display/src/game/SpaceshipRuntime.ts` is the only Phaser entry point; view models
(`spaceshipViewModel.ts`, `combatHudViewModel.ts`) stay plain and testable.

## Spec-driven workflow

OpenSpec is the source of truth for intended behavior. Features, protocol or architecture changes,
and non-trivial refactors go through `openspec/changes/<name>/` (proposal, delta specs, design,
tasks) before implementation; completed changes are archived under `openspec/changes/archive/` and
must not be edited. Current behavior lives in `openspec/specs/`. Run `pnpm spec:validate` before
claiming a change is done.

Two repo skills in `.agents/skills/` carry the detailed procedures: `openspec-workflow` (lifecycle,
artifact quality) and `realtime-game-contract` (the invariants above, plus review format for
protocol/room/economy changes). Read the relevant one before changing shared contracts.

## Agent tooling

`.claude/skills/` holds the skills Claude Code loads automatically: `browser-playwright` (Playwright
MCP session, harness ports, `tests/e2e` conventions), `react-frontend` (display/controller React
rules plus the vendored Vercel rule set in `.agents/skills/react-best-practices/`), and
`phaser-display` (boundaries; the full text stays in `.agents/skills/phaser-display/SKILL.md`, which
the other agent runners share). `.mcp.json` declares the `playwright` MCP server so a browser
session is available without extra setup; it drives a browser only and does not start app servers.

### How the global rules apply here

`~/.claude/CLAUDE.md` carries personal working rules that hold in every repository. Where this
project differs:

- **Browser work is in scope, unlike the global default.** The global rule leaves visual UI checks
  to the user; here `pnpm test:e2e` is part of `pnpm check`, and the Playwright MCP session plus
  `tests/e2e` are normal tools — see `.claude/skills/browser-playwright/SKILL.md`. What stays out is
  unrequested screenshot loops and hand-started dev servers used as proof.
- **Package manager is pnpm, never npm.** Full gate `pnpm check`; single checks
  `pnpm exec prettier --check <file>`, `pnpm --filter <pkg> exec vitest run <file>`.
- **Linter and formatter are ESLint + Prettier, not Biome** — relevant to any review agent that
  assumes otherwise.
- **Planning goes through OpenSpec.** For features, protocol changes and non-trivial refactors the
  `openspec-workflow` procedure outranks the generic decomposition rule.

## Conventions

- Strict TypeScript everywhere; ESLint runs `strictTypeChecked` + `stylisticTypeChecked` with
  `consistent-type-imports`. `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess` are on.
- Identifiers and code comments in English; product docs, OpenSpec artifacts, and player-facing UI
  strings are Russian.
- Prettier: 100 columns, double quotes, no trailing commas, `proseWrap: always` (Markdown reflows).
- Keep the display 2D — pseudo-3D art, layered space, particles, shaders; no true 3D renderer, and
  no `react-phaser-fiber`.
- **Pick wire field widths from observable precision, not from habit.** Every `@type()` in
  `SpaceshipDefenderState.ts` is paid per client per tick, and state sync already costs about twice
  the simulation step (`pnpm benchmark:combat`: `schemaSync` p50 0.16 ms against `pureFixedStep`
  0.08 ms on 196 entities). No combat quantity gets eight bytes: the arena is 4400 units wide and
  one unit is under half a pixel on screen, so `float32` covers positions, velocities, radii,
  angles, health and multipliers with four orders of magnitude to spare. Counters and flags take the
  narrowest integer that holds their range (`uint8`, `uint16`, `int32`), never a float. Strings on a
  per-tick field are a smell — send an id once at spawn instead. Simulation arithmetic in
  `game-core` stays double precision; only the published representation narrows, so determinism is
  untouched. Widening or narrowing a field is a breaking change: bump `PROTOCOL_VERSION`.
