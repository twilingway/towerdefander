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
- **`Graphics` is a drawing tool, not a display object.** Phaser walks, tessellates and batches a
  `Graphics` object on **every frame it is visible**, however long ago it was drawn — and a shape
  (`add.circle`, `add.rectangle`, `add.triangle`, …) is a `Graphics` wearing a different name. So a
  fixed shape is baked once with `bakeShape`/`bakeRect` (`generateTexture`) and put on the field as
  an `Image`, which costs four vertices and a transform. See "What may stay a drawing" below.
- One `Container` per combat entity so position and rotation apply to the whole unit.
- Camera: follow the spaceship via `getPhaserCameraScroll` with overscan, set zoom from
  `getResponsiveViewport`, keep bounds in sync on resize (`Phaser.Scale.Events.RESIZE`).
- Scale mode is `NONE` + `NO_CENTER`, and the buffer is sized by us. `RESIZE` sizes it in CSS
  pixels, which on a phone is a third of the panel each way — the arena was rasterised at a ninth of
  the pixels it was shown at. Phaser 4 has no setting for this, so `createSpaceshipRuntime` owns a
  `ResizeObserver` plus a density watcher and calls `game.scale.resize` itself;
  `getBackingStoreSize` decides how big, `DEVICE_PIXEL_RATIO_CAP` is the ceiling, `?dpr=` overrides
  it for measurement. The scene's own numbers are therefore device pixels, not CSS pixels —
  `getResponsiveViewport` is homogeneous, so the slice of world does not move, and that invariant is
  what `viewport.spec.ts` asserts.
- All interpolation/reconciliation math (point/angle transitions, camera scroll, viewport sizing,
  shield arcs) belongs in pure functions in `spaceshipViewModel.ts`, not inline in the scene. That
  keeps it unit-testable without Phaser (`spaceshipViewModel.test.ts`).

## What may stay a drawing

Measured, not assumed. A profile of a real wave on a throttled machine
(`node scripts/profile-display.mjs --cpu=4 --wave=8`) put Phaser's graphics renderer, its batcher
and the polygon tessellator at **two thirds of the main thread**, with none of our own code in the
top twenty-eight rows. Baking what could be baked took the same wave from 119 fps and 26.5% torn
frames to 154 fps and 0.5%.

- **Bake it** when the shape is fixed and only its place, angle, size, tint or alpha change: hulls,
  guns, shells, rocks, obstacles, loot, health bars, focus rings, the aiming wedge, the arena floor,
  the shield. A drawing far larger than a sensible texture (the arena is 4400 units across) is baked
  at a fixed resolution and stretched — curves and flat fills carry that without showing it.
- **Keep it a drawing** only when the geometry genuinely differs every frame and cannot be expressed
  as a transform of a baked one. Laser beams are the current example: endpoints come from the room
  and change every tick.
- **A filter follows an image, not a `Graphics`.** A `Graphics` object carries no width or height,
  so Phaser calls it poorly bounded and composites its filters through a focus region that does not
  follow a rotation — which is why the shield's glow used to tear off when it turned, and why the
  shield was left as a per-frame drawing for months. An `Image` has a size; the bloom travels with
  it.
- **A texture key is the whole recipe.** Bake per shape _and_ per size/style, and leave out anything
  that is a transform: `shield:up:104:0.803` is right, `shield:up:104:0.803:1.57` (bearing) is a
  texture per frame.

## Determinism and performance

- No gameplay decisions in `update()`: no collision resolution, damage, spawning, or timers that
  affect state. Visual-only effects (particles, shader uniforms) are allowed but must not feed back
  into snapshot interpretation.
- Avoid per-frame allocations: reuse buffers/objects, cache property access in loops, destroy game
  objects when reconciliation removes them. Worth knowing where this sits: in the same profile the
  garbage collector was 2%, the drawing 65% — allocation is worth tidying, never worth a rewrite
  until a profile says so.
- **Profile before optimising, and measure while flying.** `scripts/profile-display.mjs` for where
  the frame goes, `scripts/bench-panels.mjs` for what changed. Both need `--cpu=4`, because this
  desktop runs everything at 165 fps with no stutters at all, and both fly the ship
  (`scripts/fly-the-ship.mjs`) — a parked ship measures a still picture. Twice on this branch the
  obvious suspect (React, then allocation) was wrong and the profile settled it in twelve seconds.
- Renderer settings stay `antialias: true`, `roundPixels: false`,
  `mipmapFilter: "LINEAR_MIPMAP_LINEAR"` (the background tiles are power-of-two and drawn far
  smaller than they are stored) and `powerPreference: "high-performance"`, unless an accepted change
  says otherwise.

## Verification

After changes to display code run at least:

```text
pnpm check
```

plus the relevant unit tests for touched view-model functions, and Playwright smoke tests for
browser flows once they exist. Report commands that could not run and why.
