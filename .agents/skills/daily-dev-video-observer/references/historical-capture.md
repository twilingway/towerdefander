# Historical capture procedure

Use this procedure only after the user gives a date.

1. Compute the last commit of that local calendar day. Confirm the hash in the final report.
2. Create a unique temporary directory outside the repository. Add a detached worktree at that commit there.
3. Run the research script from the worktree, directing its output to the source repository's `artifacts/daily-videos/<date>/` only after confirming the resolved output is inside that directory.
4. If the revision exposes `pnpm demo:visible`, install nothing new. Run the existing scripts and capture the visible display with a browser or the harness's own capture option.
5. For a recording, prefer the browser automation facility already available to the revision. Save the video under `artifacts/daily-videos/<date>/captures/` and preserve its native WebM format; conversion to MP4 is a separate optional editing step.
6. On success, remove only the exact temporary worktree directory created in step 2. Never delete a path derived from user input or the main repository directory.

If a command needs to write Git worktree metadata or launch Chrome, request the required permission at that moment. Do not switch the main worktree as a fallback.
