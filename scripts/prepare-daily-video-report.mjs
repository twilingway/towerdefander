import { execFileSync } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve, sep } from "node:path";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const arguments_ = process.argv.slice(2);
const { date, overwrite } = parseArguments(arguments_);
const reportDirectory = safeReportDirectory(date);
const reportPath = join(reportDirectory, "research.md");

if (!overwrite) {
  try {
    await access(reportPath);
    throw new Error(`Report already exists: ${reportPath}. Use --overwrite to replace it.`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

const commits = commitsForDay(date).map((commit) => ({
  ...commit,
  paths: changedPaths(commit.hash)
}));
const changes = await changedOpenSpecChanges(commits);

await mkdir(reportDirectory, { recursive: true });
await writeFile(reportPath, renderReport({ date, commits, changes }), "utf8");
console.log(`Daily video research saved to ${relative(repositoryRoot, reportPath)}`);

function parseArguments(values) {
  let date;
  let overwrite = false;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--date") {
      date = values[index + 1];
      index += 1;
    } else if (value === "--overwrite") {
      overwrite = true;
    } else {
      throw new Error(`Unknown argument: ${value}. Usage: --date YYYY-MM-DD [--overwrite]`);
    }
  }
  if (!isIsoDate(date)) {
    throw new Error("A valid --date YYYY-MM-DD is required.");
  }
  return { date, overwrite };
}

function isIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function safeReportDirectory(date) {
  const root = resolve(repositoryRoot, "artifacts", "daily-videos");
  const target = resolve(root, date);
  if (!target.startsWith(`${root}${sep}`)) {
    throw new Error("Report output must remain inside artifacts/daily-videos.");
  }
  return target;
}

function commitsForDay(date) {
  const nextDay = addOneDay(date);
  const output = git([
    "log",
    `--since=${date}T00:00:00`,
    `--until=${nextDay}T00:00:00`,
    "--pretty=format:%H%x1f%h%x1f%aI%x1f%s%x1e"
  ]);
  return output
    .split("\x1e")
    .filter(Boolean)
    .map((record) => {
      const [hash, shortHash, authoredAt, subject] = record.split("\x1f");
      return { hash, shortHash, authoredAt, subject };
    });
}

function addOneDay(date) {
  const utc = new Date(`${date}T00:00:00.000Z`);
  utc.setUTCDate(utc.getUTCDate() + 1);
  return utc.toISOString().slice(0, 10);
}

function changedPaths(hash) {
  return git(["diff-tree", "--root", "--no-commit-id", "--name-only", "-r", hash])
    .split(/\r?\n/u)
    .filter(Boolean);
}

async function changedOpenSpecChanges(commits) {
  const names = new Set();
  for (const commit of commits) {
    for (const path of commit.paths) {
      const match = /^openspec\/changes\/([^/]+)\//u.exec(path);
      if (match !== null) names.add(match[1]);
    }
  }
  return await Promise.all(
    [...names].sort().map(async (name) => ({
      name,
      proposal: await readOptionalText(
        join(repositoryRoot, "openspec", "changes", name, "proposal.md")
      )
    }))
  );
}

async function readOptionalText(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
}

function renderReport({ date, commits, changes }) {
  const lines = [
    `# Исходник ежедневного видео — ${date}`,
    "",
    "Этот файл содержит только проверяемые факты из Git и OpenSpec. Текст для диктора готовится skill отдельно.",
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
      if (change.proposal === undefined) {
        lines.push("`proposal.md` недоступен в текущем рабочем дереве.", "");
      } else {
        lines.push("```markdown", change.proposal.trim(), "```", "");
      }
    }
  }
  lines.push("## Дальше", "");
  lines.push(
    "Передайте этот файл skill `daily-dev-video`; он подготовит сценарий Shorts и список кадров."
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
