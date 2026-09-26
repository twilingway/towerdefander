// Claude Code Stop hook: typecheck the working tree before an agent turn ends.
//
// Stays silent when no TypeScript file differs from HEAD, or when the same
// diff already passed. On a red typecheck it blocks the stop once and hands
// the errors back to the agent; if the agent stops again while still red
// (`stop_hook_active`), it only warns, so a failure outside the agent's own
// diff cannot trap it in a loop. Tests are deliberately not run here: some
// of them fail intermittently, and a blocking gate on a flake is a loop.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const TS_FILE = /(\.(ts|tsx|mts|cts)|(^|\/)tsconfig[^/]*\.json)$/;
const MAX_ERROR_LINES = 30;

function readInput() {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return {};
  }
}

function git(args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 64 << 20 });
  return result.status === 0 ? result.stdout : null;
}

function changedTsFiles() {
  const status = git(["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  if (status === null) return null;
  const files = [];
  const entries = status.split("\0");
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.length < 4) continue;
    const code = entry.slice(0, 2);
    const file = entry.slice(3);
    // A rename carries its source path in the next NUL-separated field.
    if (code.includes("R") || code.includes("C")) i++;
    if (TS_FILE.test(file)) files.push({ file, untracked: code === "??" });
  }
  return files;
}

function fingerprint(files) {
  const hash = createHash("sha1");
  hash.update(git(["rev-parse", "HEAD"]) ?? "");
  hash.update(git(["diff", "HEAD", "--", ...files.map((f) => f.file)]) ?? "");
  for (const { file, untracked } of files) {
    const full = path.join(root, file);
    if (untracked && existsSync(full)) hash.update(file).update(readFileSync(full));
  }
  return hash.digest("hex");
}

function stampPath() {
  const gitPath = git(["rev-parse", "--git-path", "claude-typecheck-ok"]);
  return gitPath === null ? null : path.resolve(root, gitPath.trim());
}

const input = readInput();
const files = changedTsFiles();
if (files === null || files.length === 0) process.exit(0);

const print = fingerprint(files);
const stamp = stampPath();
if (stamp !== null && existsSync(stamp) && readFileSync(stamp, "utf8") === print) process.exit(0);

const run = spawnSync("pnpm", ["typecheck"], {
  cwd: root,
  encoding: "utf8",
  shell: process.platform === "win32",
  maxBuffer: 64 << 20
});

if (run.status === 0) {
  if (stamp !== null) writeFileSync(stamp, print);
  process.exit(0);
}

const output = `${run.stdout ?? ""}\n${run.stderr ?? ""}`;
const errors = output.split(/\r?\n/).filter((line) => /error TS\d+/.test(line));
const shown =
  errors.slice(0, MAX_ERROR_LINES).join("\n") || output.trim().split(/\r?\n/).slice(-20).join("\n");
const more =
  errors.length > MAX_ERROR_LINES ? `\n... and ${errors.length - MAX_ERROR_LINES} more` : "";

if (input.stop_hook_active === true) {
  process.stdout.write(
    JSON.stringify({ systemMessage: `pnpm typecheck is still failing (${errors.length} errors).` })
  );
  process.exit(0);
}

process.stdout.write(
  JSON.stringify({
    decision: "block",
    reason:
      `pnpm typecheck failed on the working tree (${errors.length} errors):\n${shown}${more}\n\n` +
      "Fix the errors in files you changed this session. If a flagged file is not in your own " +
      "diff, do not edit it: report the failure to the user and stop."
  })
);
