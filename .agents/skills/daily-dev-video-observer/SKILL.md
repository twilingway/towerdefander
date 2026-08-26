---
name: daily-dev-video-observer
description: "Prepare evidence-backed Russian YouTube Shorts material from a SpaceShip Defender development day, including an isolated historical worktree and demo captures."
---

# Daily Dev Video Observer

Use this skill when the user asks for a daily development video, Shorts script, report from a date, or captures of SpaceShip Defender from a historical commit.

## Outcome

Create `artifacts/daily-videos/<YYYY-MM-DD>/` with an evidence source, Russian short-form script, shot list, and any requested code/game captures. Keep confirmed facts separate from narration suggestions.

## Historical observer mode

- Never run `git checkout`, `reset`, or `stash` in the repository worktree.
- Select the last commit from the requested local calendar day with `git rev-list -1 --before="<next day> 00:00" HEAD`. If no commit exists that day, say so and stop before capture.
- Create a detached temporary worktree outside the repository, perform all source inspection and demo runs there, then remove it after the material is saved. Do not remove the worktree if capture/cleanup fails; report its exact path instead.
- The result is a reproducible run of that revision, not a literal recording made on that day. State this in the deliverable when recording a historical version.

## Evidence and script

1. Run `node scripts/prepare-daily-video-report.mjs --date <YYYY-MM-DD>` in the source worktree. Do not treat uncommitted files as completed work.
2. Read `artifacts/daily-videos/<date>/research.md`, relevant commit diffs, and only the OpenSpec artifacts the report links.
3. Write `shorts-script.md` in Russian. Include: 1–2 sentence hook, 2–4 viewer-facing accomplishments, 25–50 second narration, and a clear next-step or question for viewers.
4. Write `shot-list.md`. For every line of narration name the matching source: code view, OpenSpec fragment, `lobby.png`, `combat.png`, or recorded gameplay time range.
5. If there are no commits, say that no commit-based report exists; do not inflate unrelated current work into the report.

## Captures

- Use the existing visible-demo harness only when it is available in the selected revision. It runs an isolated authoritative local room.
- Save imagery only under `artifacts/daily-videos/<date>/captures/`; do not write into source directories.
- For interface/game screenshots, use `lobby.png` and `combat.png` when the harness capture option is available. Otherwise take a browser screenshot of the isolated display page after confirming the room and active combat.
- For gameplay video, record a short 16:9 WebM with the isolated browser flow. Capture a clean 10–20 seconds of active combat, then include its duration and codec/container in `shot-list.md`. Do not claim this is a recording from the past day.
- If the historical revision has no runnable harness, still deliver research, script, and code shots; explicitly mark visual gameplay as unavailable.

## Deliverable format

End with a compact Russian summary: selected commit, evidence files, created captures/video, and any limitation. Do not publish or upload to YouTube.
