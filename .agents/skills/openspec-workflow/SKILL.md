---
name: openspec-workflow
description:
  Drive SpaceShip Defender changes through the OpenSpec lifecycle. Use for new features,
  architecture or protocol changes, non-trivial refactors, and any task that needs proposal,
  behavioral specs, design, implementation tasks, verification, or archival.
---

# OpenSpec Workflow

Use OpenSpec as the source of truth for intended behavior and task progress. Keep artifacts concise,
behavioral, and synchronized with implementation.

## Workflow

1. Read `AGENTS.md`, `docs/PROJECT_PLAN.md`, `openspec/config.yaml`, and the relevant current specs.
2. Inspect active changes with `pnpm spec list` and `pnpm spec status --change <name>`.
3. Resolve material product decisions before creating implementation tasks.
4. Create or update proposal, delta specs, design, and tasks in dependency order. Run
   `pnpm spec instructions <artifact> --change <name>` to obtain current schema instructions rather
   than relying on memory.
5. Ask for approval when a proposal introduces a material product, dependency, deployment, security,
   privacy, or compatibility decision.
6. Implement only tasks whose required artifacts are complete.
7. Mark tasks complete only after implementation and relevant checks pass.
8. Run `pnpm spec:validate` before claiming completion.
9. Reconcile specs with accepted behavior, then archive the change.

## Artifact quality

- State requirements as observable behavior, not internal implementation.
- Give each requirement at least one concrete scenario.
- Include failure, reconnect, duplicate-command, and authorization scenarios when relevant.
- Keep design decisions linked to requirements and documented risks.
- Split tasks so each has a clear output and verification command.
- Do not silently change accepted scope while applying tasks.

OpenSpec integrations may generate skills under `.codex/skills`, while this Codex installation
discovers repository skills from `.agents/skills`. Treat this skill as the stable bridge. Do not
duplicate or move generated files without explicit approval.
