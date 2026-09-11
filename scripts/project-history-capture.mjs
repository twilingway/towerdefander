// Photographs one day of this project by running that day's build.
//
// The revision is checked out into a detached worktree, its own dependencies
// are installed, its own server and vite servers are started, and a browser
// plays through the version until the room leaves the lobby. Nothing here
// touches the working tree, and nothing is taken from any other day: a frame
// that cannot be made is reported missing, never substituted.
//
// It needs the evidence of the day first, for the revision:
//   node scripts/project-history-evidence.mjs --all
//
// Usage:
//   node scripts/project-history-capture.mjs --date 2026-08-25
//   node scripts/project-history-capture.mjs --all --skip-existing
//   node scripts/project-history-capture.mjs --from 2026-08-20 --to 2026-08-27
import { execFileSync, spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { access, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

import { ADMIN_SINCE, COMBAT_MARKER, ROOM_CODE, recipeFor } from "./project-history-recipes.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const historyRoot = resolve(root, "artifacts", "project-history");
const worktreeRoot = resolve(root, ".daily-worktrees");
const isWindows = process.platform === "win32";
/** A port block of its own, so a capture can run beside `pnpm dev` and the e2e harnesses. */
const PORTS = { server: 37567, display: 37173, controller: 37174, admin: 37175 };
const VIEWPORT = { width: 1600, height: 900 };
/** How long the fight is left running before its frame is taken. */
const COMBAT_SETTLE_MS = 12_000;

const options = parseArguments(process.argv.slice(2));
let failures = 0;
for (const date of options.dates) {
  try {
    await captureDay(date);
  } catch (error) {
    failures += 1;
    console.error(`${date}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
process.exitCode = failures > 0 && options.dates.length === 1 ? 1 : 0;

function parseArguments(values) {
  const dates = [];
  let all = false;
  let from;
  let to;
  let skipExisting = false;
  let video = true;
  let keepWorktree = false;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--date") dates.push(values[(index += 1)]);
    else if (value === "--all") all = true;
    else if (value === "--from") from = values[(index += 1)];
    else if (value === "--to") to = values[(index += 1)];
    else if (value === "--skip-existing") skipExisting = true;
    else if (value === "--no-video") video = false;
    else if (value === "--keep-worktree") keepWorktree = true;
    else throw new Error(`Unknown argument: ${value}`);
  }
  let selected = dates;
  if (all || from !== undefined || to !== undefined) {
    selected = collectedDays().filter(
      (day) => (from === undefined || day >= from) && (to === undefined || day <= to)
    );
  }
  if (selected.length === 0) {
    throw new Error("Nothing to capture. Use --date YYYY-MM-DD, --all, or --from/--to.");
  }
  for (const day of selected) {
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(day)) throw new Error(`Not a date: ${day}`);
  }
  return { dates: selected, skipExisting, video, keepWorktree };
}

/** Days whose evidence has already been collected: the capture reads the revision from it. */
function collectedDays() {
  let entries;
  try {
    entries = readdirSync(historyRoot, { withFileTypes: true });
  } catch {
    throw new Error("Run scripts/project-history-evidence.mjs --all first.");
  }
  return entries
    .filter(
      (entry) => entry.isDirectory() && existsSync(join(historyRoot, entry.name, "evidence.json"))
    )
    .map((entry) => entry.name)
    .sort();
}

async function captureDay(date) {
  const directory = safeDayDirectory(date);
  const captures = join(directory, "captures");
  const evidence = await readEvidence(directory, date);
  if (options.skipExisting && (await exists(join(directory, "capture.json")))) {
    console.log(`${date}: already captured.`);
    return;
  }
  const status = [];
  const recipe = recipeFor(date);
  console.log(`${date}: ${recipe.title}, revision ${evidence.revision.slice(0, 7)}`);
  await mkdir(captures, { recursive: true });
  await rm(join(captures, "gameplay.webm"), { force: true });

  const worktree = join(worktreeRoot, `history-${date}`);
  if (!worktree.startsWith(`${worktreeRoot}${sep}`)) throw new Error("Unsafe worktree path.");
  await mkdir(worktreeRoot, { recursive: true });
  await rm(worktree, { recursive: true, force: true, maxRetries: 3 }).catch(() => undefined);
  git(["worktree", "prune"]);
  git(["worktree", "add", "--detach", worktree, evidence.revision]);

  const running = [];
  let shots = [];
  try {
    await install(worktree, status);
    running.push(await startServer(worktree, status));
    running.push(...(await startApps(worktree, date, status)));
    shots = await photograph(date, recipe, captures, status);
  } finally {
    for (const child of running) await stopChild(child);
    if (!options.keepWorktree) await removeWorktree(worktree, status);
  }

  const capture = {
    date,
    revision: evidence.revision,
    era: { id: recipe.id, title: recipe.title },
    capturedAt: new Date().toISOString(),
    shots,
    status
  };
  await writeFile(join(directory, "capture.json"), `${JSON.stringify(capture, undefined, 2)}\n`);
  await writeFile(join(directory, "capture-status.md"), renderStatus(capture), "utf8");
  console.log(`${date}: ${String(shots.length)} frames -> ${relative(root, captures)}`);
}

async function readEvidence(directory, date) {
  let evidence;
  try {
    evidence = JSON.parse(await readFile(join(directory, "evidence.json"), "utf8"));
  } catch {
    throw new Error(`No evidence for ${date}. Run project-history-evidence.mjs --date ${date}.`);
  }
  if (typeof evidence.revision !== "string") {
    throw new Error(`${date} has no commits, so there is no revision to run.`);
  }
  return evidence;
}

async function install(worktree, status) {
  const offline = await runPnpm(["install", "--offline", "--frozen-lockfile"], worktree);
  if (offline.code === 0) return;
  status.push("Локального склада pnpm не хватило: зависимости докачаны из сети.");
  const online = await runPnpm(["install", "--frozen-lockfile"], worktree);
  if (online.code === 0) return;
  const loose = await runPnpm(["install", "--no-frozen-lockfile"], worktree);
  if (loose.code !== 0) throw new Error(`Dependencies could not be installed: ${loose.tail}`);
  status.push("Локфайл этой ревизии не сходится с её package.json; установка без него.");
}

async function startServer(worktree, status) {
  const manifest = JSON.parse(await readFile(join(worktree, "apps", "server", "package.json")));
  const environment = {
    HOST: "127.0.0.1",
    PORT: String(PORTS.server),
    GRACEFUL_SHUTDOWN: "false",
    RECONNECTION_GRACE_SECONDS: "5",
    ALLOW_START_WAVE: "true"
  };
  const built = await runPnpm(["--filter", manifest.name, "build"], worktree);
  const bundle = join(worktree, "apps", "server", "dist", "index.js");
  let child;
  if (built.code === 0 && (await exists(bundle))) {
    child = background(process.execPath, ["apps/server/dist/index.js"], worktree, environment);
  } else {
    status.push("Сервер этой ревизии не собрался бандлом; запущен из исходников через tsx.");
    child = background(
      process.execPath,
      ["--import", "tsx", "src/index.ts"],
      join(worktree, "apps", "server"),
      environment
    );
  }
  await waitForUrl(`http://127.0.0.1:${String(PORTS.server)}/health`, child, 120_000);
  return child;
}

async function startApps(worktree, date, status) {
  const shared = {
    VITE_GAME_SERVER_URL: `ws://127.0.0.1:${String(PORTS.server)}`,
    VITE_CONTROLLER_URL: `http://127.0.0.1:${String(PORTS.controller)}`
  };
  const wanted = [
    { app: "display", port: PORTS.display, environment: shared },
    { app: "controller", port: PORTS.controller, environment: shared },
    ...(date >= ADMIN_SINCE
      ? [
          {
            app: "admin",
            port: PORTS.admin,
            environment: { ADMIN_API_TARGET: `http://127.0.0.1:${String(PORTS.server)}` }
          }
        ]
      : [])
  ];
  const started = [];
  for (const { app, port, environment } of wanted) {
    const bin = await viteBinary(worktree, app);
    if (bin === undefined) {
      status.push(`Приложение ${app} не запущено: в этой ревизии не нашлось vite.`);
      continue;
    }
    const child = background(
      process.execPath,
      [bin, `apps/${app}`, "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
      worktree,
      environment
    );
    try {
      await waitForUrl(`http://127.0.0.1:${String(port)}/`, child, 90_000);
      started.push(child);
    } catch (error) {
      status.push(`Приложение ${app} не поднялось: ${error.message}`);
      await stopChild(child);
    }
  }
  return started;
}

async function viteBinary(worktree, app) {
  const candidates = [
    join(worktree, "apps", app, "node_modules", "vite", "bin", "vite.js"),
    join(worktree, "node_modules", "vite", "bin", "vite.js")
  ];
  for (const candidate of candidates) if (await exists(candidate)) return candidate;
  return undefined;
}

async function photograph(date, recipe, captures, status) {
  const shots = [];
  const browser = await chromium.launch({ channel: "chrome", headless: false });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    ...(options.video ? { recordVideo: { dir: captures, size: VIEWPORT } } : {})
  });
  const display = await context.newPage();
  try {
    await display.goto(`http://127.0.0.1:${String(PORTS.display)}/`, { waitUntil: "load" });
    await enterMode(display, recipe, status);
    await chooseCrew(display, recipe, status);
    await display
      .getByRole("button", { name: recipe.start ?? "Создать комнату" })
      .first()
      .click();
    await display.waitForSelector(ROOM_CODE, { timeout: 45_000 });
    const code = (await display.locator(ROOM_CODE).first().innerText()).trim();
    await shoot(display, captures, "lobby", "Общий экран: комната собрана", shots);

    const controllers = await seatCrew(context, recipe, code, captures, shots, status);
    if (controllers.length > 0) {
      try {
        await display.waitForSelector(COMBAT_MARKER, { timeout: 90_000 });
        await display.waitForTimeout(COMBAT_SETTLE_MS);
        await shoot(display, captures, "combat", "Бой этой версии", shots);
        await shoot(controllers[0], captures, "controller", "Пульт игрока в бою", shots);
      } catch (error) {
        status.push(`Боевой кадр не снят: ${firstLine(error)}`);
      }
    }
    if (date >= ADMIN_SINCE) await shootAdmin(context, captures, shots, status);
  } catch (error) {
    status.push(`Съёмка прервана: ${firstLine(error)}`);
  } finally {
    const video = options.video ? display.video() : undefined;
    await context.close();
    await browser.close();
    if (video !== undefined) await keepVideo(video, captures, shots, status);
  }
  return shots;
}

/** Versions from 2026-09-11 open on a grid of modes; older ones have no door. */
async function enterMode(display, recipe, status) {
  if (recipe.mode === undefined) return;
  try {
    const tile = display.getByRole("button", { name: recipe.mode });
    if ((await tile.count()) > 0) await tile.first().click();
  } catch (error) {
    status.push(`Режим не выбран: ${firstLine(error)}`);
  }
}

async function chooseCrew(display, recipe, status) {
  if (recipe.crew === undefined) return;
  try {
    if (recipe.crew.kind === "select") {
      const select = display.locator("select").first();
      if ((await select.count()) > 0) await select.selectOption(recipe.crew.value);
      return;
    }
    const button = display.getByRole("button", { name: recipe.crew.value });
    if ((await button.count()) > 0) await button.first().click();
  } catch (error) {
    status.push(`Размер экипажа выбрать не удалось: ${firstLine(error)}`);
  }
}

async function seatCrew(context, recipe, code, captures, shots, status) {
  const pages = [];
  for (let index = 0; index < recipe.controllers; index += 1) {
    const page = await context.newPage();
    const seat = String(index + 1);
    try {
      const ready = await joinRoom(page, code, `Игрок ${seat}`);
      if (index === 0) await shoot(page, captures, "lobby-controller", "Пульт в лобби", shots);
      await ready.click();
      pages.push(page);
    } catch (error) {
      status.push(`Пульт ${seat} не сел за место: ${firstLine(error)}${await pageError(page)}`);
      await page
        .screenshot({ path: join(captures, `join-failed-${seat}.png`) })
        .catch(() => undefined);
    }
  }
  if (pages.length < recipe.controllers) {
    status.push(
      `Экипаж собран не полностью: ${String(pages.length)} из ${String(recipe.controllers)}.`
    );
  }
  return pages;
}

/*
 * Filling the form once is not enough on the newer clients: `?room=` is read as
 * a legacy address and answered with a redirect to `/room/<code>`, which mounts
 * the form again and drops whatever was typed into the old one. So the form is
 * filled and submitted until the lobby answers, rather than once on trust.
 */
async function joinRoom(page, code, name) {
  await page.goto(
    `http://127.0.0.1:${String(PORTS.controller)}/?room=${encodeURIComponent(code)}`,
    {
      waitUntil: "load"
    }
  );
  const ready = page.getByRole("button", { name: "Я готов" }).first();
  let failure;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.waitForTimeout(1_000);
    if ((await ready.count()) > 0) return ready;
    try {
      const room = page.locator('input[name="roomCode"]').first();
      await room.waitFor({ timeout: 15_000 });
      if ((await room.inputValue()).trim().length === 0) await room.fill(code);
      await page.locator('input[name="playerName"]').first().fill(name);
      await page.getByRole("button", { name: "Подключиться" }).first().click();
      await ready.waitFor({ timeout: 15_000 });
      return ready;
    } catch (error) {
      failure = error;
    }
  }
  throw failure ?? new Error("the lobby never appeared");
}

/** Whatever the client itself said about the failure, if it said anything. */
async function pageError(page) {
  try {
    const message = page.locator(".error-message").first();
    if ((await message.count()) === 0) return "";
    return ` (${(await message.innerText()).trim()})`;
  } catch {
    return "";
  }
}

async function shootAdmin(context, captures, shots, status) {
  const page = await context.newPage();
  try {
    await page.goto(`http://127.0.0.1:${String(PORTS.admin)}/`, { waitUntil: "load" });
    await page.waitForTimeout(2_500);
    await shoot(page, captures, "admin", "Консоль баланса", shots);
  } catch (error) {
    status.push(`Кадр консоли баланса не снят: ${firstLine(error)}`);
  } finally {
    await page.close();
  }
}

async function shoot(page, captures, id, title, shots) {
  const file = `${id}.png`;
  await page.screenshot({ path: join(captures, file) });
  shots.push({ id, title, file });
}

/** One recording is kept - the shared screen - and the crew's own videos are dropped. */
async function keepVideo(video, captures, shots, status) {
  try {
    const source = await video.path();
    const target = join(captures, "gameplay.webm");
    await rename(source, target);
    shots.push({ id: "gameplay", title: "Запись боя", file: "gameplay.webm" });
  } catch (error) {
    status.push(`Видео боя не сохранено: ${firstLine(error)}`);
  }
  for (const name of await readdir(captures)) {
    if (name.endsWith(".webm") && name !== "gameplay.webm") {
      await rm(join(captures, name), { force: true }).catch(() => undefined);
    }
  }
}

function renderStatus(capture) {
  const lines = [`# Съёмка — ${capture.date}`, ""];
  lines.push(
    `- Ревизия: \`${capture.revision}\``,
    `- Эпоха: ${capture.era.title}`,
    "- Это воспроизведение выбранной ревизии сегодня, а не запись, сделанная в тот день.",
    ""
  );
  lines.push("## Снято", "");
  if (capture.shots.length === 0) lines.push("Ничего снять не удалось.", "");
  for (const shot of capture.shots) lines.push(`- ${shot.title} — \`captures/${shot.file}\``);
  lines.push("", "## Не снято", "");
  if (capture.status.length === 0) lines.push("Всё, что планировалось, снято.", "");
  for (const note of capture.status) lines.push(`- ${note}`);
  return `${lines.join("\n")}\n`;
}

async function removeWorktree(worktree, status) {
  try {
    git(["worktree", "remove", "--force", worktree]);
  } catch {
    /* Falls through to the directory removal below. */
  }
  try {
    await rm(worktree, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  } catch (error) {
    status.push(`Временный worktree остался на диске: ${worktree} (${firstLine(error)})`);
  }
  git(["worktree", "prune"]);
}

function background(command, args, cwd, environment) {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...environment },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  child.tail = "";
  const remember = (chunk) => {
    child.tail = `${child.tail}${String(chunk)}`.slice(-4_000);
  };
  child.stdout.on("data", remember);
  child.stderr.on("data", remember);
  return child;
}

async function stopChild(child) {
  if (child === undefined || child.pid === undefined || child.exitCode !== null) return;
  if (isWindows) {
    await new Promise((done) => {
      const killer = spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true
      });
      killer.once("exit", done);
      killer.once("error", done);
    });
    return;
  }
  child.kill("SIGTERM");
  await new Promise((done) => setTimeout(done, 500));
  if (child.exitCode === null) child.kill("SIGKILL");
}

async function waitForUrl(url, child, timeout) {
  const deadline = Date.now() + timeout;
  for (;;) {
    if (child.exitCode !== null) {
      throw new Error(`process exited with ${String(child.exitCode)}: ${lastLines(child.tail)}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok || response.status === 404) return;
    } catch {
      /* Not listening yet. */
    }
    if (Date.now() > deadline) throw new Error(`${url} never answered`);
    await new Promise((done) => setTimeout(done, 500));
  }
}

function runPnpm(args, cwd, environment) {
  const command = isWindows ? "cmd.exe" : "pnpm";
  const parameters = isWindows ? ["/d", "/s", "/c", ["pnpm.cmd", ...args].join(" ")] : args;
  return new Promise((done) => {
    let tail = "";
    const child = spawn(command, parameters, {
      cwd,
      env: { ...process.env, ...environment },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    const remember = (chunk) => {
      tail = `${tail}${String(chunk)}`.slice(-2_000);
    };
    child.stdout.on("data", remember);
    child.stderr.on("data", remember);
    child.once("error", (error) => {
      done({ code: 1, tail: error.message });
    });
    child.once("exit", (code) => {
      done({ code: code ?? 1, tail: lastLines(tail) });
    });
  });
}

function lastLines(text) {
  return (text ?? "")
    .split(/\r?\n/u)
    .filter((line) => line.trim().length > 0)
    .slice(-4)
    .join(" / ");
}

function firstLine(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.split(/\r?\n/u)[0];
}

function safeDayDirectory(date) {
  const target = resolve(historyRoot, date);
  if (!target.startsWith(`${historyRoot}${sep}`))
    throw new Error("Output escaped the history root.");
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

function git(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}
