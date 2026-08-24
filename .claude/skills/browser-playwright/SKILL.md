---
name: browser-playwright
description:
  Drive SpaceShip Defender in a real browser — the Playwright MCP server for live inspection and the
  repo Playwright harnesses for scripted runs. Use when asked to open the app in a browser, click
  through display or controller UI, take a screenshot, reproduce a rendering or input bug, or write
  and fix specs in tests/e2e.
---

# Browser Automation

Three entry points. Pick by intent; do not reach for `pnpm check` when a single MCP click answers
the question, and do not claim a flow works from an MCP session alone when a spec should prove it.

| Intent                                                      | Use                                                    |
| ----------------------------------------------------------- | ------------------------------------------------------ |
| Look at the app, click, screenshot, read console errors     | Playwright MCP tools (`mcp__playwright__browser_*`)    |
| Regression proof that a flow works                          | a spec in `tests/e2e`, run with `pnpm test:e2e`        |
| Full run with three auto-crew controllers, FPS/Hz telemetry | `pnpm demo:visible` (real Chrome) / `pnpm demo:verify` |

## Live session (Playwright MCP)

The `playwright` MCP server is declared in `.mcp.json` and launches Chrome through
`npx @playwright/mcp`. It drives a browser only — it never starts app servers. Start them first:

```bash
pnpm dev   # server :2567, display :5173, controller :5174
```

Then `browser_navigate` to `http://localhost:5173`, `browser_snapshot` to get the accessibility tree
(prefer it over screenshots for finding elements — cheaper and gives stable refs), `browser_click` /
`browser_type` / `browser_press_key` to act, `browser_console_messages` and
`browser_network_requests` when something silently fails, `browser_take_screenshot` when the user
wants to see it.

Multiple crew members need multiple pages: `browser_tabs` opens and switches tabs. Tabs share one
browser profile, so display and controllers do share storage — for anything sensitive to isolated
sessions (reconnect tokens, per-player identity), write a `tests/e2e` spec with real
`browser.newContext()` instead.

The Phaser world is a canvas: the accessibility tree stops at `.battlefield-canvas`. Read game state
from the `data-*` attributes on `[data-testid="spaceship-world"]` (see below) via
`browser_evaluate`, not from pixels.

## Ports

| Process         | `pnpm dev` | `pnpm test:e2e` | `demo:visible` | `smoke:network` |
| --------------- | ---------- | --------------- | -------------- | --------------- |
| Colyseus server | 2567       | 35678           | 36567          | 35677           |
| Display         | 5173       | 35173           | 36173          | —               |
| Controller      | 5174       | 35174           | —              | —               |

Every harness owns its port block, so any of them can run while `pnpm dev` is up. Harnesses spawn
children with `--import ./scripts/owned-process-guard.mjs`; keep that guard when adding one.

## The join flow

Both the MCP session and every spec walk the same path (`tests/e2e/network-room.spec.ts` is the
reference):

1. Display: `Создать комнату`, then read the room code from `.room-code`.
2. Controller: open `http://<controller>/?room=<code>`, fill the `Имя` field, click `Подключиться`,
   wait for `.connection` to read `В сети`. Role is assigned by the server in join order — pilot,
   gunner, shield operator — and shown in `.role-badge`.
3. Each controller clicks `Я готов`; combat starts when the last one is ready and the display
   `.phase-badge` turns to `Корабль в бою`.

UI strings are Russian; locate by role and Russian name, exactly as the specs do.

## Observable state

`[data-testid="spaceship-world"]` carries the authoritative snapshot in `data-*` attributes:
`data-spaceship-x/-y`, `data-turret-angle`, `data-shield-angle`, `data-shield-active`,
`data-shield-energy`, `data-enemy-count`, `data-asteroid-count`, `data-friendly-projectile-count`,
`data-arena-radius`, `data-world-width/-height`. Other hooks: `combat-radar`,
`combat-radar-spaceship`, `machine-gun-heat` (`data-heat`), `virtual-stick`, `fire-button`,
`mg-fire-button`, `shield-button`, `visible-demo-overlay` with `visible-demo-render-fps`,
`visible-demo-snapshot-hz`, `visible-demo-control-hz`.

These attributes are a test contract. When display state changes shape, update them together with
the specs that poll them.

## Writing specs

- `playwright.config.ts` runs `testDir: ./tests/e2e`, `workers: 1`, `channel: "chrome"`, headless,
  `trace: "retain-on-failure"`. With `E2E_EXTERNAL_SERVERS=1` it skips `webServer` and reads
  `E2E_DISPLAY_URL` / `E2E_CONTROLLER_URL` / `E2E_HOST` — that is how `scripts/run-e2e.mjs` drives
  it on the isolated port block.
- One `BrowserContext` per participant, pushed onto a `contexts` array and closed in `finally`.
  Controllers use touch contexts (`viewport 390x844`, `hasTouch`, `isMobile`).
- Assert on server-driven values with `expect.poll`, never `waitForTimeout`. Simulation is 20 Hz and
  every visual change lags the snapshot by up to one client interpolation window (~50 ms).
- Run a single spec or case:

  ```bash
  pnpm exec playwright test tests/e2e/network-room.spec.ts -g "controllers"
  ```

  That form needs servers already up (`pnpm dev` plus matching `E2E_*` URLs, or let `webServer`
  start them on the default ports). `pnpm test:e2e` is the clean-room version and rebuilds the
  server bundle first.

## Traps that cost hours

- **Never edit source while a browser run is in flight.** Vite HMR pushes the edit into the live
  pages; the controller has rendered with no stylesheet at all and failed two specs for reasons
  unrelated to the code. Let the run finish, then edit.
- A cleared wave banks exactly its own budget: wave 1 pays 5 credits only if the crew destroys every
  threat, and one asteroid drifting out of the arena leaves 4 — not enough to buy anything. A
  harness that asserts a purchase must tolerate that and keep playing.
- Trailing browsers hold the ports. If a harness dies badly, check for stray `chrome`/`node`
  processes before blaming the code.
- Report a browser check as done only after the run you actually watched finished; if a spec failed,
  paste the failure rather than re-running until it passes.
