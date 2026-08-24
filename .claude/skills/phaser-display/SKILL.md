---
name: phaser-display
description:
  Phaser 4.2.1 conventions for the SpaceShip Defender display app. Use when writing, reviewing, or
  refactoring anything in apps/display that touches Phaser — scenes, game objects, camera, scale,
  particles, shaders, the SpaceshipRuntime bridge, or the React/Phaser boundary (SpaceshipCanvas).
---

# Phaser Display Conventions

The full skill lives in `.agents/skills/phaser-display/SKILL.md` (shared with the other agent
runners in this repo). **Read that file before changing display rendering code** — this page only
carries the boundaries that decide whether a change is allowed at all.

- Phaser is pinned to `4.2.1` and may be imported only inside `apps/display/src/game/`. Simulation
  stays pure in `packages/game-core`; messages stay in `packages/protocol`.
- The display renders authoritative snapshots and never simulates: no collision, damage, spawning,
  or gameplay timers in `update()`. Client-side interpolation (~50 ms) is display smoothing only.
- React owns the shell and HUD. The bridge is `createSpaceshipRuntime(host, snapshot)` returning
  `{ update, prepareHydration, destroy }`; Phaser types must not leak into components, and
  `react-phaser-fiber` stays out.
- Phaser loads through a dynamic import inside an effect so it stays out of the initial bundle.
- Rendering stays 2D — pseudo-3D art, layered space, particles, shaders; no true 3D renderer without
  an accepted OpenSpec change.
- Depth layers are a fixed contract (background 0–3, obstacles 2, asteroids 5, enemies 7, ship 10,
  projectiles 11, turret 12, shield 14); reconcile entities by stable id instead of rebuilding.
- Interpolation, camera and viewport math belongs in pure functions in `spaceshipViewModel.ts` so it
  is unit-testable without Phaser.

Related: `.claude/skills/browser-playwright/SKILL.md` for actually looking at the canvas in a
browser, and `.claude/skills/react-frontend/SKILL.md` for the React side of the boundary.
