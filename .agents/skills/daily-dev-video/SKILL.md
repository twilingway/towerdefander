---
name: daily-dev-video
description:
  Prepare a local Russian daily YouTube Shorts draft for SpaceShip Defender from commits, OpenSpec,
  UI captures, and an isolated historical demo.
---

# Daily Dev Video

Use this skill for a requested daily development report, Shorts script, historical build evidence,
UI screenshots, or a local video draft.

Run `pnpm daily:video --date YYYY-MM-DD`. The command writes only to
`artifacts/daily-videos/<date>/` and creates Markdown research, script, shot list, status, and
manifest files.

## Evidence

- Treat Git commits and linked OpenSpec artifacts as facts. Do not present uncommitted work as
  shipped.
- Historical capture MUST use the command's detached worktree; never switch the main working tree
  with `checkout`, `reset`, or `stash`.
- A historical recording reproduces the selected revision now. State that it was not recorded on the
  original date.
- If the revision lacks the demo harness or WebM recording capability, retain Markdown and available
  code/UI evidence, write the limitation to `status.md`, and do not fabricate a video.

## Captures and draft

- The versioned catalog is `scripts/daily-ui-catalog.json`. When adding a user-facing UI tab, add
  its URL, viewport, readiness selector, activation test id, panel test id, and source paths.
- Start an authenticated local UI first when required, then pass `--ui-url URL`. Capture only
  catalog entries whose source files changed that day.
- The visible demo emits opt-in PNG/WebM material. FFmpeg composes the actual WebM, local Microsoft
  Irina voice, and ASS captions to `draft.mp4` at 1080×1920/30 fps.
- Keep publishing and final polish outside this workflow. CapCut is for music, effects, and manual
  replacements after the draft is reviewed.
