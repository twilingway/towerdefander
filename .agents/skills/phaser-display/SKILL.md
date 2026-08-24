---
name: phaser-display
description:
  Phaser 4.2.1 conventions for the SpaceShip Defender display app. Use when writing, reviewing, or
  refactoring anything in apps/display that touches Phaser — scenes, game objects, camera, scale,
  particles, shaders, the SpaceshipRuntime bridge, or the React/Phaser boundary (SpaceshipCanvas).
---

# Phaser Display Conventions

Phaser is pinned to `4.2.1` and lives only inside `apps/display`. It renders server snapshots; it
never simulates. Keep this skill in sync with `AGENTS.md` working agreements.

## Hard boundaries

- No Phaser imports outside `apps/display/src/game/`. Simulation stays in `packages/game-core`
  (pure, no DOM/timers/randomness), messages in `packages/protocol`.
- React owns the application shell and HUD. Do not add `react-phaser-fiber`; the bridge is a small
  imperative runtime object created from a plain function.
- The display client never mutates trusted game state. It receives `DisplayGameSnapshot` values and
  sends intents only through the controller path.
- Keep rendering 2D. Pseudo-3D direction (layered deep space, particles, shaders) is allowed; do not
  introduce a true 3D renderer without an accepted OpenSpec change.

## Architecture: runtime bridge pattern

Follow `apps/display/src/game/SpaceshipRuntime.ts` + `apps/display/src/SpaceshipCanvas.tsx`:

1. A factory function (`createSpaceshipRuntime(host, initialSnapshot)`) creates the single
   `Phaser.Game` and returns a minimal interface —
   `{ update(snapshot), prepareHydration(), destroy() }`. Phaser types must not leak into React
   components; only protocol snapshot types cross the boundary.
2. One scene per game view (e.g. `SpaceshipScene extends Phaser.Scene`, key `"spaceship"`). The
   initial snapshot is passed through the scene constructor, not fetched inside the scene.
3. `update(snapshot)` maps to `scene.applySnapshot(snapshot)`. Every new server snapshot starts a
   short client-side interpolation (~50 ms, `SNAPSHOT_TRANSITION_MS`) from current visual state to
   the new values. This is display smoothing only — never gameplay logic.
4. Reconcile dynamic entities by stable id (`reconcileStableIds`): plan create/update/remove,
   destroy removed game objects, reuse existing ones. Never rebuild the whole scene per snapshot.
5. `prepareHydration()` runs on run change or reconnect epoch change: clear all combat visuals and
   latch a snap so the next snapshot applies instantly instead of tweening from stale state.

## React side rules

- Load Phaser with a dynamic import (`void import("./game/SpaceshipRuntime.js")`) inside an effect;
  it is a heavy chunk and must stay out of the initial bundle.
- Mount once in `useEffect` with cleanup that calls `destroy()` (Phaser: `game.destroy(true)`).
  Guard against post-unmount callbacks with a `disposed` flag.
- Gate updates by tick (`shouldUpdateRuntime`) and hydration by run number / connection epoch
  (`shouldPrepareRuntimeHydration`). Do not call `runtime.update` for unchanged ticks.
- Keep the host div empty; expose state to tests via `data-*` attributes on the shell, plus an
  accessible text fallback (the canvas is `aria-hidden`).

## Scene and rendering conventions

- Depth layers are a fixed contract: arena background 0–3, obstacles 2, asteroids 5, enemies 7,
  projectiles/missiles 11, spaceship body 10, turret 12, shield 14. New visuals must pick a depth
  that preserves this ordering.
- Prefer `Graphics` for vector shapes and redraw with `clear()` per frame instead of creating new
  objects; use one `Container` per combat entity so position/rotation apply to the whole unit.
- Camera: follow the spaceship via `getPhaserCameraScroll` with overscan, set zoom from
  `getResponsiveViewport`, keep bounds in sync on resize (`Phaser.Scale.Events.RESIZE`). Scale mode
  is `RESIZE` + `CENTER_BOTH`.
- All interpolation/reconciliation math (point/angle transitions, camera scroll, viewport sizing,
  shield arcs) belongs in pure functions in `spaceshipViewModel.ts`, not inline in the scene. That
  keeps it unit-testable without Phaser (`spaceshipViewModel.test.ts`).

## Determinism and performance

- No gameplay decisions in `update()`: no collision resolution, damage, spawning, or timers that
  affect state. Visual-only effects (particles, shader uniforms) are allowed but must not feed back
  into snapshot interpretation.
- Avoid per-frame allocations: reuse buffers/objects, cache property access in loops, destroy game
  objects when reconciliation removes them.
- Renderer settings stay `antialias: true`, `roundPixels: false` unless an accepted change says
  otherwise.

## Verification

After changes to display code run at least:

```text
pnpm check
```

plus the relevant unit tests for touched view-model functions, and Playwright smoke tests for
browser flows once they exist. Report commands that could not run and why.
