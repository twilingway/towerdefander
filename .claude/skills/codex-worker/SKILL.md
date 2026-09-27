---
name: codex-worker
description:
  Delegating a bounded coding task to Codex (CLI or the codex@openai-codex plugin) or to the local
  Qwen through opencode while Claude stays the lead — routing by task, isolation, Windows sandbox,
  model choice, prompt shape, acceptance and token accounting. Use when handing implementation to
  another agent, running executors in parallel, when the ChatGPT limit runs out, or when the user
  asks Codex or Qwen to take part of the work.
---

# Codex as a worker (Claude leads)

Adopted 2026-09-26 after a measured comparison on `elastic-arena-rim` 1.1-1.3 (numbers in
`~/.claude/rules/token-economy.md`). Claude splits the work, briefs Codex, verifies and integrates.
Codex's own report is never the proof — Claude reruns the checks.

## Who does what

Ranking from one task, one or two runs per executor — re-check it on the next few real tasks and
keep the table in `token-economy.md` current.

| Executor                               | Use for                                                                                                             |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Claude                                 | Specs, splitting work, contracts (protocol, room, economy), cross-package and ambiguous changes, acceptance, review |
| Codex `gpt-6-sol` high, CLI            | Default implementer: bounded task, written spec, scripted checks                                                    |
| Codex `gpt-6-luna`                     | Mechanical work where a green script is the whole acceptance                                                        |
| Codex CLI, `gpt-6-sol` or `gpt-6-luna` | Raster images — the image model is the same, only orchestration cost differs                                        |
| Qwen 3.8 27B, opencode, local          | Fallback when the ChatGPT window is spent; free background work with step-by-step prompts                           |
| Fresh `code-reviewer` subagent         | Every delegated diff, same model as the lead                                                                        |

Not used: `gpt-5.6-sol` (4-8× the tokens, no gain), `gpt-5.6-terra` (below the reference),
`gpt-6-astra` (user's call), Codex `--oss` with Qwen (cannot drive the patch tool), `/codex:rescue`
in auto mode without an allow rule.

## When

- Delegate: a task with a clear boundary (one package, named files), written done-criteria and
  checks a script can run. Parallel only when the pieces are independent.
- Don't: small local edits (the briefing costs more than the edit), protocol or room contract
  changes (`realtime-game-contract` needs Claude's own review), anything that needs the dev stand or
  a browser.

## Where it runs

- **Never in the main working tree.** One git worktree per task under
  `E:\MySource\ReactJS\games\td-agents\<task>`, on a fresh branch off `main` (the project's standing
  branching permission covers this). E: holds the pnpm store, so an install is seconds:
  `pnpm install --frozen-lockfile --filter "@spaceship-defender/<pkg>..." --filter "."`.
- **Windows sandbox.** `~/.codex/config.toml` has `[windows] sandbox = "unelevated"` since
  2026-09-26: the elevated sandbox fails with `helper_unknown_error: setup refresh had errors` on
  every CLI from 0.155 (openai/codex#46515, #24098; `codex doctor` shows "sandbox provisioning
  failed"). Unelevated refuses directories under `%TEMP%` ("cannot enforce split writable root
  sets"), so keep every target directory on E:. It also denies child-process spawns inside some
  tools (`spawn EPERM` from vitest's fork pool); one run "fixed" that by committing a
  `vitest.config.mjs` with a thread pool — reject any config file that only exists to work around
  the sandbox.
- **Smoke test first**, once per session, in the target directory:
  `codex exec -C <dir> --sandbox workspace-write -m gpt-6-sol -c 'model_reasoning_effort="low"' 'Run node --version and write it to ./v.txt'`,
  then check `v.txt` exists and delete it. No file → fix the sandbox before delegating anything.

## Model and effort

- Default `gpt-6-sol` at `high`: one of its two runs tied with Claude for the best solution at
  ~$0.55 and ~1.35M input tokens; `gpt-5.6-sol` spent 4-8× the tokens for a comparable or bouncier
  result. Needs CLI ≥ 0.155 — 0.154 rejects it as "not supported".
- `gpt-6-luna` is ~20× cheaper and passed every check, yet the review found the task unsolved (the
  ship still pins to the rim at base stats). Use it only where a green script is the whole
  acceptance — mechanical edits, test scaffolding — never for tuning or design.
- `gpt-5.6-terra` came out below the merged reference and added unrequested config fields; no reason
  to pick it over `gpt-6-sol`.
- Green checks are not acceptance. Every delegated diff gets a review against the spec scenarios.
- `gpt-6-astra` is off-limits: the user's call (too expensive).
- `high` spawns sub-sessions; their tokens are in their own rollout files.
- Two or three Codex sessions in parallel at most: eight exhausted the ChatGPT window.

## CLI or plugin

- **CLI — default for implementation.** Full control, usage in the output:

  ```bash
  codex exec -C <worktree> --sandbox workspace-write -m gpt-6-sol -c 'model_reasoning_effort="high"' --json -o <scratchpad>/codex-<task>.md - < <scratchpad>/codex-<task>-prompt.md > <scratchpad>/codex-<task>.jsonl
  ```

  Run it in the background; `turn.completed.usage` in the JSONL has the tokens.

- **Plugin — for reviews.** `/codex:review` and `/codex:adversarial-review` are read-only and cheap.
  Its `/codex:rescue` goes through a Sonnet forwarder subagent (~80k tokens on top) that the auto
  mode classifier blocks unless the user adds an allow rule. When the plugin must implement, call
  the companion from the main session with an explicit target:
  `node <plugin-root>/scripts/codex-companion.mjs task --write --cwd <worktree> --model gpt-6-sol --effort high "<prompt>"`.
  Without `--cwd` it writes into the current directory — the main tree.

## Local Qwen through opencode

Measured 2026-09-26/27. The local model costs no quota; the price is the GPU and wall time.

- **Harness: opencode, not Codex.** `codex exec --oss --local-provider lmstudio` runs Qwen without
  any OpenAI login (verified with an empty `CODEX_HOME`), but Qwen cannot drive Codex's patch tool:
  one run wrote patch scripts into the repo root and never wired its code in. opencode's own edit
  tools work.
- **Run:**

  ```bash
  NO_PROXY="localhost,127.0.0.1,::1,.local,192.168.1.227" no_proxy="$NO_PROXY" opencode run -m lmstudio/qwen3.8-27b --dir <worktree> --auto --format json "<prompt>" > <scratchpad>/oc-<task>.jsonl
  ```

  LM Studio serves on `192.168.1.227:1234`; without `NO_PROXY` the request goes through the local
  proxy on `127.0.0.1:10809` and fails with 503. `--auto` approves every command and opencode has no
  sandbox — only ever point `--dir` at a task worktree. Continue a stopped session with `-c`.

- **Prompt as explicit steps.** Qwen researches well and then stops mid-sentence instead of calling
  a tool; the first run spent 29 minutes tuning constants and wrote nothing. "Stop tuning. Use the
  constants you found, implement 1.1-1.3 now, then run the four checks and report" got it done.
  Write the prompt as: implement → run the checks → report, with no open-ended exploration step.
- **Context corridor.** Decode speed on this machine: ~45 tok/s near empty, ~39 at 30-60k, ~34 at
  90k, ~29 at 120k; cold prefill of 120k takes ~80 s. opencode compacts when the request exceeds the
  model's `limit.context` minus its `limit.output` (140000 − 32000 ≈ 108k here); a run grew to 117k
  before compacting and a continuation settled at 55-64k.
- **LM Studio load settings** (`Qwen3.8 27B`, unsloth Q4_K_M): context 140000, GPU offload 65 (all
  layers), K cache `q8_0`, V cache `q4_0`, flash attention on, physical batch 512 (1024 measured no
  faster, 256 halved prefill), eval batch 1024, MTP speculative decoding on. Vision is off: the
  projector is renamed to `mmproj-F16.gguf.disabled`; rename it back for screenshot work. The
  `opencode.json` entry must match: `limit.context` 140000, `modalities.input` `["text"]`.
- **Quality so far.** One run, ranked above the merged reference but below every finished Codex
  `gpt-6-sol` or Claude solution: it fixed the pinning and introduced an endless orbit when the
  pilot lets go plus a ~460-unit dead zone at the rim, none of which its tests caught. Review is not
  optional.

## Prompt

Same shape every time; English; no repository tour — Codex reads `AGENTS.md` itself.

```text
Implement <tasks> of the OpenSpec change `openspec/changes/<change>` (read its proposal.md, specs/
and tasks.md first).

Scope: <package> only. Follow AGENTS.md and docs/CODE_STYLE.md.
Do not edit openspec/, do not tick tasks, do not commit, do not touch other packages or any
config file. If a check cannot run in your environment, report the error instead of working
around it.

Done when all of these pass from the repo root:
- <exact check commands>

Final message: changed files, one paragraph on the approach, and the result line of each check.
```

## Acceptance

1. Claude reruns every check in the worktree and reads the diff against the spec scenarios.
2. Larger diffs get a fresh `code-reviewer` subagent, never a cheaper model.
3. Claude reports to the user: result, tokens (input / cached / output), wall time, what was taken
   and what was rejected.
4. Integration — commit on the task branch, PR — is Claude's, under the project's usual gate.

## Cleanup

After the result is integrated or rejected, with the user's go-ahead (deleting needs it):

- `git worktree remove <path>` for each task worktree, then delete the folder; plain scratch folders
  just get deleted.
- Stop the plugin's app-server brokers left by direct `codex-companion.mjs` calls — the plugin's
  SessionEnd hook only cleans up after a real `/codex:*` session. Find them with
  `Get-CimInstance Win32_Process | ? CommandLine -match 'app-server-broker'`.
- Remove the `[projects.'<path>']` trust entries Codex adds to `~/.codex/config.toml` for every
  directory it ran in.

## Letting `/codex:rescue` run in auto mode

The plugin's rescue path is a subagent that runs the companion with `--write`; the auto mode
classifier denies it ("Create Unsafe Agents"). An allow rule in `~/.claude/settings.json` is
resolved before the classifier, so the user can scope it to agent worktrees only — not added as of
2026-09-27, and only the user adds it:

```json
{
  "permissions": {
    "allow": ["Bash(node *codex-companion.mjs task --cwd E:/MySource/ReactJS/games/td-agents/*)"]
  }
}
```

Whether the mid-pattern `*` matches the quoted script path is unverified: test that a `--cwd` into
`td-agents` passes and the same call without `--cwd` is still denied.
