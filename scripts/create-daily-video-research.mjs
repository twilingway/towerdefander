import { execFileSync } from "node:child_process";
import { access, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve, sep } from "node:path";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { date, overwrite, revision } = parseArguments(process.argv.slice(2));
const outputDirectory = outputFor(date);
const outputPath = join(outputDirectory, "research.md");

if (!overwrite) {
  try {
    await access(outputPath);
    throw new Error(`Report already exists: ${outputPath}. Use --overwrite to replace it.`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

const commits = commitsOn(date).map((commit) => ({ ...commit, paths: pathsFor(commit.hash) }));
const changes = await readChanges(commits, revision);
await mkdir(outputDirectory, { recursive: true });
await writeFile(outputPath, render({ date, commits, changes }), "utf8");
console.log(`Daily video research saved to ${relative(repositoryRoot, outputPath)}`);

function parseArguments(arguments_) {
  let date;
  let overwrite = false;
  let revision;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--date") {
      date = arguments_[index + 1];
      index += 1;
    } else if (argument === "--overwrite") {
      overwrite = true;
    } else if (argument === "--revision") {
      revision = arguments_[index + 1];
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}. Usage: --date YYYY-MM-DD [--overwrite]`);
    }
  }
  if (!validDate(date)) throw new Error("A valid --date YYYY-MM-DD is required.");
  if (revision !== undefined && !/^[0-9a-f]{7,64}$/iu.test(revision)) {
    throw new Error("--revision must be a Git commit hash.");
  }
  return { date, overwrite, revision };
}

function validDate(date) {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === date;
}

function outputFor(date) {
  const outputRoot = resolve(repositoryRoot, "artifacts", "daily-videos");
  const target = resolve(outputRoot, date);
  if (!target.startsWith(`${outputRoot}${sep}`)) {
    throw new Error("Report output must remain inside artifacts/daily-videos.");
  }
  return target;
}

function commitsOn(date) {
  const nextDate = tomorrow(date);
  const records = git([
    "log",
    `--since=${date}T00:00:00`,
    `--until=${nextDate}T00:00:00`,
    "--pretty=format:%H%x1f%h%x1f%aI%x1f%s%x1e"
  ])
    .split("\x1e")
    .map((record) => record.trim())
    .filter(Boolean);
  return records.map((record) => {
    const [hash, shortHash, authoredAt, subject] = record.split("\x1f");
    return { hash, shortHash, authoredAt, subject };
  });
}

function tomorrow(date) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

function pathsFor(hash) {
  return git(["diff-tree", "--root", "--no-commit-id", "--name-only", "-r", hash, "--"])
    .split(/\r?\n/u)
    .filter(Boolean);
}

async function readChanges(commits, revision) {
  const changeNames = new Set();
  for (const commit of commits) {
    for (const path of commit.paths) {
      const match = /^openspec\/changes\/([^/]+)\//u.exec(path);
      if (match !== null) changeNames.add(match[1]);
    }
  }
  return [...changeNames].sort().map((name) => ({
    name,
    proposal:
      revision === undefined
        ? optionalGitText("HEAD", `openspec/changes/${name}/proposal.md`)
        : optionalGitText(revision, `openspec/changes/${name}/proposal.md`)
  }));
}

function optionalGitText(revision, path) {
  try {
    return execFileSync("git", ["show", `${revision}:${path}`], {
      cwd: repositoryRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });
  } catch {
    return undefined;
  }
}

function render({ date, commits, changes }) {
  const lines = [
    `# Исходник ежедневного видео — ${date}`,
    "",
    "Только проверяемые факты из Git и OpenSpec. Текст для диктора готовится отдельно.",
    "",
    "## Git-коммиты",
    ""
  ];
  if (commits.length === 0) {
    lines.push("За этот день в текущей ветке нет коммитов.", "");
  } else {
    for (const commit of commits) {
      lines.push(`### ${commit.shortHash} — ${commit.subject}`, "");
      lines.push(`- Полный hash: \`${commit.hash}\``);
      lines.push(`- Авторская дата: ${commit.authoredAt}`);
      lines.push(`- Затронуто файлов: ${commit.paths.length}`, "");
    }
  }
  lines.push("## Связанные OpenSpec changes", "");
  if (changes.length === 0) {
    lines.push("В выбранных коммитах нет изменений файлов OpenSpec.", "");
  } else {
    for (const change of changes) {
      lines.push(`### ${change.name}`, "");
      if (change.proposal === undefined) lines.push("`proposal.md` недоступен в этой ревизии.", "");
      else lines.push("```markdown", change.proposal.trim(), "```", "");
    }
  }
  lines.push(
    "## Дальше",
    "",
    "Передайте этот файл skill ежедневного видео для сценария и списка кадров."
  );
  return `${lines.join("\n")}\n`;
}

function git(arguments_) {
  try {
    return execFileSync("git", arguments_, { cwd: repositoryRoot, encoding: "utf8" }).trim();
  } catch (error) {
    const detail = error?.stderr?.toString().trim() ?? error.message;
    throw new Error(`Git command failed: ${detail}`);
  }
}
