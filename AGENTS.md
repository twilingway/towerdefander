# SpaceShip Defender — repository instructions

## Product

Build a cooperative top-down space wave-defense game about one upgradeable spaceship. One shared
display runs in a desktop browser or Android TV shell. Three players join from phone, tablet, or
computer browsers as pilot, gunner, and shield operator.

## Working agreements

- Follow `docs/CODE_STYLE.md` for file layout, module size, and adding behavior by extension rather
  than by editing working code.
- Use TypeScript with strict type checking. Keep identifiers and code comments in English; product
  documentation and OpenSpec artifacts may be in Russian.
- Use pnpm workspaces. Do not introduce Turborepo or another task runner unless an accepted OpenSpec
  change requires it.
- Treat the Node.js/Colyseus server as authoritative. Clients send intents; they never mutate
  trusted game state directly.
- Keep simulation code in `packages/game-core` free of Phaser, React, DOM, timers, networking, and
  nondeterministic randomness.
- Keep shared messages and versioned schemas in `packages/protocol`.
- Use Phaser only inside `apps/display`; React owns the application shell and HUD. Do not add
  `react-phaser-fiber`.
- Keep the controller responsive and usable by touch, mouse, and keyboard.
- The browser display is the primary implementation. Android TV reuses its web build through a thin
  Capacitor shell.
- Keep the visual implementation 2D. The target direction is pseudo-3D spaceship art, layered deep
  space, particles, and shader effects; do not introduce a true 3D renderer without an accepted
  OpenSpec change.

## Spec-driven workflow

- Use `$openspec-workflow` for features, architecture changes, protocol changes, and non-trivial
  refactors.
- Do not start production implementation while material product decisions in the active change are
  unresolved.
- Keep acceptance scenarios observable and testable.
- Use `$realtime-game-contract` whenever shared protocol, room lifecycle, reconnect behavior,
  economy, or simulation authority changes.

## Delegation

- Delegate independent research, specification review, implementation, and test review when doing so
  shortens the critical path.
- Use `spec_architect` before implementing a large or ambiguous change.
- Use `reviewer` after implementation and before declaring an OpenSpec change complete.
- Avoid having multiple write-capable agents edit the same files concurrently.

## Verification

Before declaring a change complete, run the narrowest relevant checks and then:

```text
pnpm check
pnpm spec:validate
```

For browser flows, also run the relevant Playwright smoke tests once they exist. Report commands
that could not run and the exact reason.

## Definition of done

- Behavior matches the accepted OpenSpec artifacts.
- Public protocol changes are versioned and validated at the server boundary.
- Commands that spend resources are idempotent.
- Reconnect and duplicate-message behavior is covered when relevant.
- Tests cover deterministic game rules and important user-visible behavior.
- Documentation and example environment files reflect new configuration.

## Safety

- Never commit credentials, tokens, certificates, or production endpoints.
- Ask before adding a production dependency that is not part of an accepted OpenSpec design.
- Do not edit generated Android build output. Change source configuration or document a required
  native override.
