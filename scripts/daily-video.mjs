import { execFile, execFileSync, spawn } from "node:child_process";
import { access, cp, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dailyRoot = join(root, "artifacts", "daily-videos");
const { date, captureDemo, gameplayInput, uiUrl } = parseArguments(process.argv.slice(2));
const output = safeDayDirectory(date);
const captures = join(output, "captures");
const status = [];

await mkdir(captures, { recursive: true });
await run(
  process.execPath,
  [join(root, "scripts", "create-daily-video-research.mjs"), "--date", date, "--overwrite"],
  root
);

const commits = commitsFor(date);
const revision = revisionFor(date);
const changedPaths = commits.flatMap((commit) => pathsFor(commit.hash));
const claims = claimsFor(commits);
const narration = narrationFor(date, claims);
await writeFile(join(output, "shorts-script.md"), renderScript(date, claims, narration), "utf8");

let uiCaptures = [];
if (uiUrl !== undefined) {
  uiCaptures = await captureUi(changedPaths, uiUrl).catch((error) => {
    status.push(`- UI-кадры не сняты: ${error.message}`);
    return [];
  });
} else {
  status.push(
    "- UI-кадры не сняты: передайте `--ui-url http://127.0.0.1:5175` для уже запущенной админки."
  );
}

let gameplayPath = await copyExplicitGameplay(gameplayInput);
if (gameplayPath !== undefined) {
  status.push("- Использован явно переданный WebM; источник указан в shot-list.");
} else if (captureDemo && revision !== undefined) {
  gameplayPath = await captureHistoricalDemo(revision).catch((error) => {
    status.push(`- Геймплей не снят: ${error.message}`);
    return undefined;
  });
} else if (revision === undefined) {
  status.push("- Геймплей не снят: за дату нет коммита, историческую ревизию выбрать нельзя.");
} else {
  status.push("- Геймплей пропущен флагом `--no-demo`.");
}

await writeFile(join(captures, "voice.txt"), narration, "utf8");
const voicePath = join(captures, "voice.wav");
let voiceDuration;
try {
  await createVoice(join(captures, "voice.txt"), voicePath);
  voiceDuration = await mediaDuration(voicePath);
} catch (error) {
  status.push(`- Озвучка не создана: ${error.message}`);
}

const duration = clampDuration(voiceDuration ?? 40);
await writeFile(join(captures, "captions.ass"), renderAss(date, claims, duration), "utf8");
let draftPath;
if (gameplayPath !== undefined && voiceDuration !== undefined) {
  try {
    draftPath = join(output, "draft.mp4");
    await renderDraft(
      gameplayPath,
      uiCaptures.at(0)?.path,
      voicePath,
      join(captures, "captions.ass"),
      draftPath,
      duration
    );
    const metadata = await mediaMetadata(draftPath);
    if (metadata.width !== 1080 || metadata.height !== 1920 || metadata.fps !== 30) {
      throw new Error(
        `ffprobe returned ${metadata.width}x${metadata.height} at ${metadata.fps} fps.`
      );
    }
    status.push(
      `- Черновик собран: ${relative(root, draftPath)} (${metadata.duration.toFixed(1)} с).`
    );
  } catch (error) {
    status.push(`- Черновик MP4 не собран: ${error.message}`);
    draftPath = undefined;
  }
} else {
  status.push(
    "- Черновик MP4 не собран: нужен настоящий WebM геймплея и локальная WAV-озвучка; поддельное видео не создаётся."
  );
}

await writeFile(
  join(output, "shot-list.md"),
  renderShotList(date, claims, uiCaptures, gameplayPath, draftPath),
  "utf8"
);
await writeFile(join(output, "status.md"), renderStatus(date, revision, status), "utf8");
const manifest = {
  date,
  revision,
  generatedAt: new Date().toISOString(),
  files: {
    research: "research.md",
    script: "shorts-script.md",
    shotList: "shot-list.md",
    status: "status.md",
    draft: draftPath === undefined ? undefined : "draft.mp4"
  },
  ui: uiCaptures.map(({ id, title, path }) => ({
    id,
    title,
    path: relative(output, path).replaceAll("\\", "/")
  })),
  gameplay:
    gameplayPath === undefined ? undefined : relative(output, gameplayPath).replaceAll("\\", "/")
};
await writeFile(join(output, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
await updateIndex(manifest);
console.log(`Daily Shorts material: ${relative(root, output)}`);

function parseArguments(args) {
  let date;
  let captureDemo = true;
  let gameplayInput;
  let uiUrl;
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--date") date = args[++index];
    else if (value === "--no-demo") captureDemo = false;
    else if (value === "--gameplay") gameplayInput = args[++index];
    else if (value === "--ui-url") uiUrl = args[++index];
    else
      throw new Error(
        "Usage: pnpm daily:video --date YYYY-MM-DD [--ui-url URL] [--gameplay FILE.webm] [--no-demo]"
      );
  }
  if (!validDate(date)) throw new Error("A valid --date YYYY-MM-DD is required.");
  return { date, captureDemo, gameplayInput, uiUrl };
}

async function copyExplicitGameplay(value) {
  if (value === undefined) return undefined;
  const source = resolve(root, value);
  const allowedRoot = `${resolve(dailyRoot)}${sep}`;
  if (!source.startsWith(allowedRoot) || !source.toLowerCase().endsWith(".webm")) {
    throw new Error("--gameplay must be a WebM stored inside artifacts/daily-videos.");
  }
  await access(source);
  const target = join(captures, "gameplay.webm");
  await cp(source, target);
  return target;
}

function validDate(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/u.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  );
}

function safeDayDirectory(day) {
  const target = resolve(dailyRoot, day);
  if (!target.startsWith(`${resolve(dailyRoot)}${sep}`))
    throw new Error("Output escaped artifacts/daily-videos.");
  return target;
}

function nextDay(day) {
  const value = new Date(`${day}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

function git(args, cwd = root) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function commitsFor(day) {
  const records = git([
    "log",
    `--since=${day}T00:00:00`,
    `--until=${nextDay(day)}T00:00:00`,
    "--pretty=format:%H%x1f%h%x1f%s%x1e"
  ])
    .split("\x1e")
    .map((item) => item.trim())
    .filter(Boolean);
  return records.map((item) => {
    const [hash, shortHash, subject] = item.split("\x1f");
    return { hash, shortHash, subject };
  });
}

function revisionFor(day) {
  const value = git([
    "rev-list",
    "-1",
    `--before=${nextDay(day)}T00:00:00`,
    `--after=${day}T00:00:00`,
    "HEAD"
  ]);
  return value.length === 0 ? undefined : value;
}

function pathsFor(hash) {
  return git(["diff-tree", "--root", "--no-commit-id", "--name-only", "-r", hash, "--"])
    .split(/\r?\n/u)
    .filter(Boolean);
}

function claimsFor(commits) {
  if (commits.length === 0) return ["За эту дату в Git нет подтверждённых изменений."];
  return commits.slice(0, 4).map((commit) => `${commit.shortHash}: ${commit.subject}`);
}

function narrationFor(day, claims) {
  return [
    `День разработки SpaceShip Defender за ${day}.`,
    "Показываю только то, что подтверждено коммитами.",
    ...claims.map((claim, index) => `Изменение ${index + 1}: ${claim}.`),
    "Дальше проверю это в живом бою и соберу следующий отчёт."
  ].join(" ");
}

function renderScript(day, claims, narration) {
  return `# Сценарий Shorts — ${day}\n\n## Хук\n\nСегодня в SpaceShip Defender — только подтверждённый прогресс за день.\n\n## Тезисы\n\n${claims.map((claim) => `- ${claim}`).join("\n")}\n\n## Текст диктора\n\n${narration}\n\n## Примечание\n\nИсторический запуск воспроизводит выбранную Git-ревизию сейчас, а не является записью, сделанной в тот день.\n`;
}

async function captureUi(changed, baseUrl) {
  const catalog = JSON.parse(
    await readFile(join(root, "scripts", "daily-ui-catalog.json"), "utf8")
  );
  const selected = catalog.filter((entry) =>
    entry.sources.some((source) => changed.includes(source))
  );
  if (selected.length === 0) {
    status.push("- Изменённых записей каталога UI нет; UI-кадры не требуются.");
    return [];
  }
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  try {
    const results = [];
    for (const entry of selected) {
      const context = await browser.newContext({ viewport: entry.viewport });
      const page = await context.newPage();
      await page.goto(baseUrl, { waitUntil: "networkidle" });
      await page.waitForSelector(entry.readySelector, { timeout: 8_000 });
      await page.getByTestId(entry.activateTestId).click();
      await page.getByTestId(entry.panelTestId).waitFor({ state: "visible" });
      const path = join(captures, `ui-${entry.id}.png`);
      await page.screenshot({ path, fullPage: true });
      results.push({ id: entry.id, title: entry.title, path });
      await context.close();
    }
    status.push(`- Снято UI-кадров: ${results.length}.`);
    return results;
  } finally {
    await browser.close();
  }
}

async function captureHistoricalDemo(revision) {
  const worktreeRoot = resolve(root, ".daily-worktrees");
  const worktree = resolve(worktreeRoot, `${date}-${process.pid}`);
  if (!worktree.startsWith(`${worktreeRoot}${sep}`))
    throw new Error("Unsafe historical worktree path.");
  await mkdir(worktreeRoot, { recursive: true });
  await run("git", ["worktree", "add", "--detach", worktree, revision], root);
  try {
    const demo = join(worktree, "scripts", "run-visible-demo.mjs");
    try {
      await access(demo);
    } catch {
      throw new Error("В выбранной ревизии нет demo-harness.");
    }
    const historicalCaptures = join(worktree, "artifacts", "daily-videos", date, "captures");
    await mkdir(historicalCaptures, { recursive: true });
    await runPackage(["install", "--offline", "--frozen-lockfile"], worktree);
    await runPackage(["demo:verify"], worktree, {
      DEMO_CAPTURE_DIR: historicalCaptures,
      DEMO_RECORD_VIDEO_DIR: historicalCaptures
    });
    const videos = (await readdir(historicalCaptures)).filter((name) => name.endsWith(".webm"));
    if (videos.length === 0)
      throw new Error("Эта ревизия не умеет записывать WebM; фальшивое видео не создано.");
    const source = join(historicalCaptures, videos[0]);
    const target = join(captures, "gameplay.webm");
    await cp(source, target);
    for (const image of ["lobby.png", "combat.png"]) {
      try {
        await cp(join(historicalCaptures, image), join(captures, image));
      } catch {
        /* optional historical capture */
      }
    }
    status.push(`- Снят WebM исторической ревизии ${revision.slice(0, 7)}.`);
    return target;
  } finally {
    await run("git", ["worktree", "remove", "--force", worktree], root).catch(() => undefined);
    await rm(worktree, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(
      () => undefined
    );
  }
}

function runPackage(args, cwd, env) {
  if (process.platform !== "win32") return run("pnpm", args, cwd, env);
  const command = ["pnpm.cmd", ...args].join(" ");
  return run("cmd.exe", ["/d", "/s", "/c", command], cwd, env);
}

async function createVoice(textPath, outputPath) {
  if (process.platform !== "win32")
    throw new Error("Локальный SAPI-голос доступен только в Windows.");
  await run(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      join(root, "scripts", "daily-tts.ps1"),
      "-TextPath",
      textPath,
      "-OutputPath",
      outputPath
    ],
    root
  );
}

async function renderDraft(gameplay, ui, voice, ass, target, duration) {
  const ffmpeg = await findFfmpeg("ffmpeg.exe", "ffmpeg");
  const escapedAss = relative(root, ass).replaceAll("\\", "/").replaceAll(":", "\\:");
  const args = ["-y", "-i", gameplay];
  const hasUi = ui !== undefined;
  if (hasUi) args.push("-loop", "1", "-i", ui);
  args.push(
    "-f",
    "lavfi",
    "-t",
    String(duration),
    "-i",
    "color=c=0x081120:s=1080x1920:r=30",
    "-i",
    voice
  );
  const backgroundInput = hasUi ? 2 : 1;
  const voiceInput = hasUi ? 3 : 2;
  const filters = [
    "[0:v]scale=1080:1215:force_original_aspect_ratio=increase,crop=1080:1215[game]",
    `[${backgroundInput}:v][game]overlay=0:0[base]`
  ];
  if (hasUi) {
    filters.push(
      "[1:v]scale=1020:540:force_original_aspect_ratio=decrease,pad=1020:540:(ow-iw)/2:(oh-ih)/2:color=0x0d1b32[ui]"
    );
    filters.push("[base][ui]overlay=30:1320[withui]");
    filters.push(`[withui]ass=${escapedAss}[video]`);
  } else filters.push(`[base]ass=${escapedAss}[video]`);
  args.push(
    "-filter_complex",
    filters.join(";"),
    "-map",
    "[video]",
    "-map",
    `${voiceInput}:a`,
    "-t",
    String(duration),
    "-r",
    "30",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-movflags",
    "+faststart",
    target
  );
  await run(ffmpeg, args, root);
}

function renderAss(day, claims, duration) {
  const escape = (value) => value.replaceAll("{", "").replaceAll("}", "").replaceAll("\\n", "\\N");
  const title = escape(`SpaceShip Defender — ${day}`);
  const body = escape(claims.slice(0, 2).join("\\N"));
  const end = formatAssTime(duration);
  return `[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\n\n[V4+ Styles]\nFormat: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding\nStyle: Title,Arial,56,&H00FFFFFF,&H000000FF,&H00121C34,&HAA121C34,1,0,0,0,100,100,0,0,1,3,1,2,40,40,1240,1\nStyle: Caption,Arial,42,&H00FFFFFF,&H000000FF,&H00121C34,&HAA121C34,0,0,0,0,100,100,0,0,1,3,1,2,56,56,70,1\n\n[Events]\nFormat: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text\nDialogue: 0,0:00:00.00,${end},Title,,0,0,0,,${title}\nDialogue: 0,0:00:02.00,${end},Caption,,0,0,0,,${body}\n`;
}

function formatAssTime(seconds) {
  const rounded = Math.max(1, Math.round(seconds * 100) / 100);
  const whole = Math.floor(rounded);
  return `${Math.floor(whole / 3600)}:${String(Math.floor((whole % 3600) / 60)).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}.${String(Math.round((rounded - whole) * 100)).padStart(2, "0")}`;
}

function clampDuration(value) {
  return Math.max(35, Math.min(45, value));
}

async function findFfmpeg(executable, fallback) {
  try {
    await run(fallback, ["-version"], root, undefined, true);
    return fallback;
  } catch {
    /* inspect winget install */
  }
  const packageRoot = join(process.env.LOCALAPPDATA ?? "", "Microsoft", "WinGet", "Packages");
  const packages = await readdir(packageRoot, { withFileTypes: true });
  for (const entry of packages.filter(
    (item) => item.isDirectory() && item.name.startsWith("Gyan.FFmpeg")
  )) {
    const candidate = join(packageRoot, entry.name);
    const found = await findFile(candidate, executable);
    if (found !== undefined) return found;
  }
  throw new Error("FFmpeg не найден. Установите Gyan.FFmpeg через winget или задайте PATH.");
}

async function findFile(directory, name) {
  const items = await readdir(directory, { withFileTypes: true });
  for (const item of items) {
    const path = join(directory, item.name);
    if (item.isFile() && item.name.toLowerCase() === name.toLowerCase()) return path;
    if (item.isDirectory()) {
      const found = await findFile(path, name);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

async function mediaDuration(path) {
  const probe = await findFfmpeg("ffprobe.exe", "ffprobe");
  const output = await run(
    probe,
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      path
    ],
    root,
    undefined,
    true
  );
  return Number(output.trim());
}

async function mediaMetadata(path) {
  const probe = await findFfmpeg("ffprobe.exe", "ffprobe");
  const output = await run(
    probe,
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height,r_frame_rate:format=duration",
      "-of",
      "json",
      path
    ],
    root,
    undefined,
    true
  );
  const parsed = JSON.parse(output);
  const stream = parsed.streams[0];
  const [numerator, denominator] = stream.r_frame_rate.split("/").map(Number);
  return {
    width: stream.width,
    height: stream.height,
    fps: Math.round(numerator / denominator),
    duration: Number(parsed.format.duration)
  };
}

function renderShotList(day, claims, ui, gameplay, draft) {
  return (
    `# Список кадров — ${day}\n\n| Время | Кадр | Источник |\n| --- | --- | --- |\n| 0–4 с | Хук и дата | ` +
    "`shorts-script.md`" +
    ` |\n| 4–28 с | Бой | ${gameplay === undefined ? "недоступен" : "`captures/gameplay.webm`"} |\n| 28–40 с | ${claims.join("; ")} | ${ui.length === 0 ? "коммиты и OpenSpec" : ui.map((item) => `\`${relative(output, item.path)}\``).join(", ")} |\n\nЧерновик: ${draft === undefined ? "не собран" : "`draft.mp4` (1080×1920, 30 fps)"}.\n`
  );
}

function renderStatus(day, revision, lines) {
  return `# Статус — ${day}\n\n- Историческая ревизия: ${revision === undefined ? "не найдена" : `\`${revision}\``}.\n- Исторический запуск создаётся в отдельном detached worktree и не переключает текущую ветку.\n${lines.join("\n")}\n`;
}

async function updateIndex(manifest) {
  const path = join(dailyRoot, "index.json");
  let entries = [];
  try {
    entries = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  entries = entries.filter((entry) => entry.date !== manifest.date);
  entries.push({
    date: manifest.date,
    path: `${manifest.date}/manifest.json`,
    draft: manifest.files.draft
  });
  entries.sort((left, right) => right.date.localeCompare(left.date));
  await writeFile(path, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
}

function run(command, args, cwd, env, captureOutput = false) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      windowsHide: true,
      stdio: captureOutput ? ["ignore", "pipe", "pipe"] : "inherit"
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0
        ? resolvePromise(stdout)
        : reject(
            new Error(
              `${command} exited with ${String(code)}${stderr.length === 0 ? "" : `: ${stderr.trim()}`}`
            )
          )
    );
  });
}
