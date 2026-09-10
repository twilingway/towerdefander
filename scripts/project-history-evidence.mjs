// Collects the verifiable facts of one development day.
//
// The narrative of this project cannot be read off `git log --oneline`: the
// subjects name edits, not the game. What does carry the reasoning is the
// commit body - this repository writes them at length - together with the
// OpenSpec proposal a day touched, and the contract versions that moved. This
// gathers exactly those, per local calendar day, and writes them where the
// capture and the report can pick them up.
//
// Usage:
//   node scripts/project-history-evidence.mjs --date 2026-08-25 [--overwrite]
//   node scripts/project-history-evidence.mjs --all [--overwrite]
import { execFileSync } from "node:child_process";
import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const historyRoot = resolve(root, "artifacts", "project-history");
/** ASCII unit and record separators: git subjects and bodies contain neither. */
const UNIT = "\u001f";
const RECORD = "\u001e";
/** Contract constants worth naming in a report, and where they live. */
const CONTRACTS = [
  { name: "PROTOCOL_VERSION", path: "packages/protocol/src/index.ts" },
  { name: "BALANCE_FILE_VERSION", path: "packages/protocol/src/balance.ts" },
  { name: "BALANCE_STATS_FILE_VERSION", path: "packages/protocol/src/balanceStats.ts" }
];
/** Memoised: the whole log is one git call, and every day reads from it. */
let history;

const { dates, overwrite } = parseArguments(process.argv.slice(2));
for (const date of dates) {
  const directory = safeDayDirectory(date);
  if (!overwrite && (await exists(resolve(directory, "evidence.json")))) {
    console.log(`${date}: evidence already collected.`);
    continue;
  }
  const evidence = collectDay(date);
  await mkdir(directory, { recursive: true });
  await writeFile(
    resolve(directory, "evidence.json"),
    `${JSON.stringify(evidence, undefined, 2)}\n`,
    "utf8"
  );
  await writeFile(resolve(directory, "evidence.md"), renderEvidence(evidence), "utf8");
  console.log(
    `${date}: ${String(evidence.commits.length)} commits -> ${relative(root, directory)}`
  );
}

function parseArguments(values) {
  let date;
  let all = false;
  let overwrite = false;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--date") {
      date = values[index + 1];
      index += 1;
    } else if (value === "--all") all = true;
    else if (value === "--overwrite") overwrite = true;
    else throw new Error(`Unknown argument: ${value}. Usage: --date YYYY-MM-DD | --all`);
  }
  if (all) return { dates: daysWithCommits(), overwrite };
  if (!isIsoDate(date)) throw new Error("A valid --date YYYY-MM-DD is required, or --all.");
  return { dates: [date], overwrite };
}

/** Every commit in history order, newest first, tagged with its local author day. */
function allCommits() {
  const output = git([
    "log",
    "--date=format-local:%Y-%m-%d",
    `--pretty=format:%H${UNIT}%h${UNIT}%aI${UNIT}%ad${UNIT}%s${UNIT}%b${RECORD}`
  ]);
  return output
    .split(RECORD)
    .map((record) => record.trimStart())
    .filter((record) => record.trim().length > 0)
    .map((record) => {
      const [hash, shortHash, authoredAt, day, subject, body] = record.split(UNIT);
      return { hash, shortHash, authoredAt, day, subject, body: (body ?? "").trim() };
    });
}

/*
 * The day a commit belongs to is the day it was authored, not the day its
 * hash was written. Three of the last four days went through a pull request,
 * and a rebase moves every commit date to the merge - by that clock the work
 * of the ninth lands on the tenth.
 */
function historyCommits() {
  history ??= allCommits();
  return history;
}

/** Every local calendar day that carries at least one commit, oldest first. */
export function daysWithCommits() {
  return [...new Set(historyCommits().map((commit) => commit.day))].sort();
}

function collectDay(date) {
  const ofDay = historyCommits()
    .map((commit, index) => ({ commit, index }))
    .filter(({ commit }) => commit.day === date);
  const commits = [...ofDay]
    .reverse()
    .map(({ commit }) => ({ ...commit, ...statsFor(commit.hash), paths: pathsFor(commit.hash) }));
  const revision = ofDay.at(0)?.commit.hash;
  const lastIndex = ofDay.at(-1)?.index;
  const previous = lastIndex === undefined ? undefined : historyCommits()[lastIndex + 1]?.hash;
  return {
    date,
    revision,
    previousRevision: previous,
    collectedAt: new Date().toISOString(),
    commits,
    areas: areasFor(commits),
    workspaces: workspaceDifference(previous, revision),
    contracts: contractsFor(previous, revision),
    dependencies: dependencyDifference(previous, revision),
    openSpec: openSpecFor(commits, revision)
  };
}

function pathsFor(hash) {
  return git(["diff-tree", "--root", "--no-commit-id", "--name-only", "-r", hash, "--"])
    .split(/\r?\n/u)
    .filter(Boolean);
}

function statsFor(hash) {
  const rows = git(["diff-tree", "--root", "--no-commit-id", "--numstat", "-r", hash, "--"])
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((row) => row.split("\t"));
  let insertions = 0;
  let deletions = 0;
  for (const [added, removed] of rows) {
    insertions += Number(added) || 0;
    deletions += Number(removed) || 0;
  }
  return { insertions, deletions };
}

/** Which part of the repository the day actually moved, by touched files. */
function areasFor(commits) {
  const counts = new Map();
  for (const commit of commits) {
    for (const path of commit.paths) {
      const area = areaOf(path);
      counts.set(area, (counts.get(area) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([area, files]) => ({ area, files }));
}

function areaOf(path) {
  const match = /^(apps|packages|tools)\/([^/]+)\//u.exec(path);
  if (match !== null) return `${match[1]}/${match[2]}`;
  const top = path.split("/")[0];
  return path.includes("/") ? top : "корень";
}

/** Apps and packages that appeared or disappeared between the two revisions. */
function workspaceDifference(previous, revision) {
  const before = new Set(workspacesAt(previous));
  const after = new Set(workspacesAt(revision));
  return {
    added: [...after].filter((name) => !before.has(name)).sort(),
    removed: [...before].filter((name) => !after.has(name)).sort()
  };
}

function workspacesAt(revision) {
  if (revision === undefined) return [];
  return git(["ls-tree", "--name-only", revision, "apps/", "packages/", "tools/"])
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((value) => value.replace(/\/$/u, ""));
}

function contractsFor(previous, revision) {
  return CONTRACTS.map(({ name, path }) => ({
    name,
    before: constantAt(previous, path, name),
    after: constantAt(revision, path, name)
  })).filter((entry) => entry.before !== entry.after);
}

function constantAt(revision, path, name) {
  const source = fileAt(revision, path);
  if (source === undefined) return undefined;
  const match = new RegExp(`${name}\\s*=\\s*(\\d+)`, "u").exec(source);
  return match === null ? undefined : Number(match[1]);
}

function dependencyDifference(previous, revision) {
  const before = dependenciesAt(previous);
  const after = dependenciesAt(revision);
  return {
    added: [...after.keys()].filter((name) => !before.has(name)).sort(),
    removed: [...before.keys()].filter((name) => !after.has(name)).sort()
  };
}

function dependenciesAt(revision) {
  const found = new Map();
  if (revision === undefined) return found;
  const manifests = git(["ls-tree", "-r", "--name-only", revision])
    .split(/\r?\n/u)
    .filter((path) => path.endsWith("package.json") && !path.includes("node_modules"));
  for (const path of manifests) {
    const source = fileAt(revision, path);
    if (source === undefined) continue;
    let manifest;
    try {
      manifest = JSON.parse(source);
    } catch {
      continue;
    }
    for (const field of ["dependencies", "devDependencies"]) {
      for (const [name, version] of Object.entries(manifest[field] ?? {})) {
        if (!name.startsWith("@spaceship-defender/") && !name.startsWith("@town-defenders/")) {
          found.set(name, version);
        }
      }
    }
  }
  return found;
}

/** Only the OpenSpec changes this day's commits actually touched. */
function openSpecFor(commits, revision) {
  const names = new Set();
  for (const commit of commits) {
    for (const path of commit.paths) {
      const archived = /^openspec\/changes\/archive\/([^/]+)\//u.exec(path);
      if (archived !== null) {
        names.add(archived[1]);
        continue;
      }
      const match = /^openspec\/changes\/([^/]+)\//u.exec(path);
      if (match !== null) names.add(match[1]);
    }
  }
  return [...names].sort().map((name) => ({ name, proposal: proposalAt(revision, name) }));
}

function proposalAt(revision, name) {
  const source =
    fileAt(revision, `openspec/changes/${name}/proposal.md`) ??
    fileAt("HEAD", `openspec/changes/${name}/proposal.md`) ??
    fileAt("HEAD", `openspec/changes/archive/${name}/proposal.md`);
  if (source === undefined) return undefined;
  const lines = source.trim().split(/\r?\n/u);
  return lines.length > 60 ? `${lines.slice(0, 60).join("\n")}\n…` : lines.join("\n");
}

function fileAt(revision, path) {
  if (revision === undefined) return undefined;
  try {
    return execFileSync("git", ["show", `${revision}:${path}`], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"]
    });
  } catch {
    return undefined;
  }
}

function renderEvidence(evidence) {
  const lines = [`# Свидетельства дня — ${evidence.date}`, ""];
  lines.push(
    "Только проверяемые факты из Git. Текст истории пишется отдельно и опирается на этот файл.",
    ""
  );
  lines.push(
    `- Ревизия конца дня: ${evidence.revision === undefined ? "нет" : `\`${evidence.revision}\``}`,
    `- Предыдущая ревизия: ${
      evidence.previousRevision === undefined ? "нет" : `\`${evidence.previousRevision}\``
    }`,
    `- Коммитов: ${String(evidence.commits.length)}`,
    ""
  );
  if (evidence.commits.length === 0) {
    lines.push("За этот день в текущей ветке нет коммитов.", "");
    return `${lines.join("\n")}\n`;
  }
  lines.push("## Где шла работа", "");
  for (const { area, files } of evidence.areas) lines.push(`- ${area}: ${String(files)} файлов`);
  lines.push("");
  if (evidence.workspaces.added.length > 0 || evidence.workspaces.removed.length > 0) {
    lines.push("## Состав проекта", "");
    for (const name of evidence.workspaces.added) lines.push(`- появилось: ${name}`);
    for (const name of evidence.workspaces.removed) lines.push(`- исчезло: ${name}`);
    lines.push("");
  }
  if (evidence.contracts.length > 0) {
    lines.push("## Версии контрактов", "");
    for (const { name, before, after } of evidence.contracts) {
      lines.push(`- ${name}: ${String(before ?? "нет")} -> ${String(after ?? "нет")}`);
    }
    lines.push("");
  }
  if (evidence.dependencies.added.length > 0 || evidence.dependencies.removed.length > 0) {
    lines.push("## Зависимости", "");
    for (const name of evidence.dependencies.added) lines.push(`- добавлена: ${name}`);
    for (const name of evidence.dependencies.removed) lines.push(`- убрана: ${name}`);
    lines.push("");
  }
  lines.push("## Коммиты", "");
  for (const commit of evidence.commits) {
    lines.push(`### ${commit.shortHash} — ${commit.subject}`, "");
    lines.push(
      `- ${commit.authoredAt}, файлов ${String(commit.paths.length)}, +${String(commit.insertions)} / -${String(commit.deletions)}`,
      ""
    );
    if (commit.body.length > 0) lines.push(commit.body, "");
    lines.push("<details><summary>Файлы</summary>", "");
    for (const path of commit.paths.slice(0, 40)) lines.push(`- ${path}`);
    if (commit.paths.length > 40) lines.push(`- … ещё ${String(commit.paths.length - 40)}`);
    lines.push("", "</details>", "");
  }
  if (evidence.openSpec.length > 0) {
    lines.push("## Затронутые OpenSpec-изменения", "");
    for (const change of evidence.openSpec) {
      lines.push(`### ${change.name}`, "");
      lines.push(change.proposal === undefined ? "`proposal.md` недоступен." : change.proposal, "");
    }
  }
  return `${lines.join("\n")}\n`;
}

function isIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function nextDay(date) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

function safeDayDirectory(date) {
  const target = resolve(historyRoot, date);
  if (!target.startsWith(`${historyRoot}${sep}`)) {
    throw new Error("Output escaped the history root.");
  }
  return target;
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function git(arguments_) {
  try {
    return execFileSync("git", arguments_, {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024
    }).trim();
  } catch (error) {
    const detail = error?.stderr?.toString().trim() ?? error.message;
    throw new Error(`Git command failed: ${detail}`);
  }
}
