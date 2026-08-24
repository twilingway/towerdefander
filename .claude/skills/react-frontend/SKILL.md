---
name: react-frontend
description:
  React 19 + Vite conventions for the SpaceShip Defender display and controller apps, plus the
  Vercel React performance rule set vendored in this repo. Use when building or reviewing UI in
  apps/display or apps/controller — components, hooks, HUD, touch and keyboard input, room view
  adapters, styling, or frontend tests.
---

# React Frontend

Two React 19 + Vite 8 apps: `apps/display` (shared screen, HUD, Phaser host) and `apps/controller`
(pilot / gunner / shield panels). Both are strict TypeScript with `exactOptionalPropertyTypes` and
`noUncheckedIndexedAccess`, ESM imports written with the `.js` extension
(`import { App } from "./App.js"`), and `consistent-type-imports`.

## Boundaries that are not style preferences

- **Never read Colyseus schema objects in UI code.** `apps/display/src/roomView.ts`
  (`toDisplayRoomView`) and `apps/controller/src/roomView.ts` (`toControllerRoomView`) flatten
  `MapSchema`/`ArraySchema` into plain objects and validate them with `displayRoomViewSchema.parse`
  / `controllerRoomViewSchema.parse`. Components consume only the parsed plain view.
- A protocol field change usually touches four places: the `packages/protocol` schema, server state
  - sync, and both roomView adapters. Missing one is the classic bug here.
- Clients send intents; they never mutate trusted state. Continuous inputs carry a monotonic
  `sequence`; resource-spending actions carry `actionId` + `revision` so retries stay safe.
- Phaser only inside `apps/display/src/game/` — see `.claude/skills/phaser-display/SKILL.md`.
- Player-facing strings are Russian; identifiers and comments are English.

## Component conventions

- Keep logic out of components: derived state lives in pure modules (`combatHudViewModel.ts`,
  `spaceshipViewModel.ts`, `controlInput.ts`, `voteIntent.ts`, `displayRoomLifecycle.ts`) that are
  unit-tested without React.
- The controller must work with touch, mouse, and keyboard on the same control. Pointer Events with
  capture, and handling of `pointercancel`, `lostpointercapture` and `blur` so a held control
  releases — `ActionZone.tsx` and `VirtualStick.tsx` are the reference implementations; reuse them
  instead of writing new pointer handling.
- Effects: mount-once patterns with a `disposed` flag and real cleanup (socket, runtime, listeners).
  Gate expensive updates by tick/epoch (`shouldUpdateRuntime`, `shouldPrepareRuntimeHydration`)
  rather than re-rendering on every snapshot.
- `data-testid` and `data-*` attributes on display elements are the e2e contract. Changing them
  means changing `tests/e2e` in the same commit.
- Styling is plain CSS in `styles.css` per app; no CSS-in-JS, no UI framework.

## Tests

- Component tests render with `renderToStaticMarkup` from `react-dom/server` and assert on markup —
  there is no jsdom and no Testing Library. Do not add either without an accepted OpenSpec change;
  interaction belongs in Playwright (`.claude/skills/browser-playwright/SKILL.md`).
- Pure modules get plain Vitest unit tests next to them.
- Single file or case:

  ```bash
  pnpm --filter @spaceship-defender/display exec vitest run src/roomView.test.ts -t "shield"
  ```

## Performance rule set

`.agents/skills/react-best-practices/` is the vendored Vercel guide: `AGENTS.md` is the compiled
document, `rules/` holds ~70 single-rule files named `<area>-<topic>.md` (`bundle-*`, `rendering-*`,
`async-*`, `client-*`, `js-*`, `advanced-*`). Grep `rules/` for the area you are touching and read
the matching file rather than the whole document. Note that it targets Next.js in places — the
bundle, rendering and plain-JS rules apply here, the RSC/server-action ones do not.

Ignore the build instructions in that directory's `README.md`; it is vendored content, kept out of
lint and Prettier on purpose.
