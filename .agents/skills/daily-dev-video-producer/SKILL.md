---
name: daily-dev-video-producer
description:
  "Prepare evidence-backed Russian YouTube Shorts material from a SpaceShip Defender development
  day, including isolated historical captures and vertical gameplay recordings."
---

# Daily Dev Video Producer

Use this skill for a daily development video, Shorts script, report from a date, or historical
SpaceShip Defender footage.

## Outcome

Create `artifacts/daily-videos/<YYYY-MM-DD>/` containing `research.md`, `shorts-script.md`,
`shot-list.md`, and requested captures. Keep confirmed facts separate from narration suggestions.

## Historical observer mode

- Never run `git checkout`, `reset`, or `stash` in the repository worktree.
- Select the last commit from the requested local calendar day with
  `git rev-list -1 --before="<next day> 00:00" HEAD`. If no commit exists, report that and stop
  before capture.
- Create a detached temporary worktree outside the repository; inspect source and run the demo only
  there. Remove only that exact worktree after success.
- A historical recording reproduces the selected revision; it is not a literal recording made on
  that day. State this in the deliverable.

## Evidence and script

1. In the selected revision run
   `node scripts/create-daily-video-research.mjs --date <YYYY-MM-DD> [--overwrite]`.
2. Read the generated `research.md`, relevant commit diffs, and only the linked OpenSpec artifacts.
3. Write `shorts-script.md` in Russian: a short hook, 2–4 verifiable achievements, 25–50 seconds of
   narration, and a final next-step or viewer question.
4. Write `shot-list.md`. Attach a source to every narration line: code view, OpenSpec fragment,
   interface screenshot, gameplay screenshot, or recording time range.
5. With no commits, state that there is no commit-based report. Do not present uncommitted files as
   completed work.

## Visual material

- Use an available visible-demo harness only in an isolated local room. Store every result under
  `artifacts/daily-videos/<date>/captures/`.
- Capture interface and combat separately. Check the screenshot before adding it to the shot list.
- For gameplay video record a clean 10–20 second 16:9 WebM, then lay it into a 1080×1920
  composition: gameplay is the main panel; code, title, and Russian text comments fill the remaining
  vertical space. Include container, duration, and intended crop in `shot-list.md`.
- If the historical revision cannot run the demo, deliver research, script, and code material and
  mark gameplay footage unavailable.

## Scope

Do not publish to YouTube. Do not install a production dependency. Ask before adding a local encoder
if none is already available.
