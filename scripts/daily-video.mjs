import { execFileSync, spawn } from "node:child_process";
import { access, cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dailyRoot = join(root, "artifacts", "daily-videos");
const { date, captureDemo, gameplayInput, uiUrl } = parseArguments(process.argv.slice(2));
const output = safeDayDirectory(date);
const captures = join(output, "captures");
const status = [];

await mkdir(captures, { recursive: true });
const revision = revisionFor(date);
await run(
  process.execPath,
  [
    join(root, "scripts", "create-daily-video-research.mjs"),
    "--date",
    date,
    "--overwrite",
    ...(revision === undefined ? [] : ["--revision", revision])
  ],
  root
);

const commits = commitsFor(date);
const changedPaths = commits.flatMap((commit) => pathsFor(commit.hash));
const claims = claimsFor(commits);
const narration = narrationFor(date, claims);
await writeFile(join(output, "shorts-script.md"), renderScript(date, claims, narration), "utf8");

let uiCaptures = [];
if (revision !== undefined) {
  uiCaptures = await captureHistoricalUi(revision, changedPaths).catch((error) => {
    status.push(`- UI-кадры исторической ревизии не сняты: ${error.message}`);
    return [];
  });
} else if (uiUrl !== undefined) {
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

let rawGameplayPath;
if (gameplayPath !== undefined) {
  try {
    rawGameplayPath = join(output, "gameplay-raw.mp4");
    await renderRawGameplay(gameplayPath, rawGameplayPath);
    status.push(
      "- Сохранён чистый клип для ручного монтажа: gameplay-raw.mp4 (без звука и текста)."
    );
  } catch (error) {
    status.push(`- Чистый клип не собран: ${error.message}`);
  }
}

await writeFile(join(captures, "voice.txt"), narration, "utf8");
await writeFile(join(captures, "voice.ssml"), renderSsml(narration), "utf8");
const voicePath = join(captures, "voice.wav");
let voiceDuration;
try {
  await createVoice(join(captures, "voice.ssml"), voicePath);
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
    if (
      metadata.width !== 1080 ||
      metadata.height !== 1920 ||
      metadata.fps !== 30 ||
      metadata.duration < 35 ||
      metadata.duration > 45
    ) {
      throw new Error(
        `ffprobe returned ${metadata.width}x${metadata.height} at ${metadata.fps} fps for ${metadata.duration.toFixed(1)} seconds.`
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
  renderShotList(date, claims, uiCaptures, gameplayPath, rawGameplayPath, draftPath),
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
    draft: draftPath === undefined ? undefined : "draft.mp4",
    rawGameplay: rawGameplayPath === undefined ? undefined : "gameplay-raw.mp4"
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
  if (source !== target) await cp(source, target);
  return target;
}

function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
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
  return commits.slice(0, 4).map((commit) => summarizeCommit(commit.subject));
}

function summarizeCommit(subject) {
  const known = new Map([
    ["feat: оружие в центре", "Перенёс оружие в центр корпуса, чтобы корабль выглядел собраннее."],
    [
      "feat(display): give the player's guns a look of their own",
      "Сделал пушки игрока визуально отличимыми."
    ],
    [
      "fix(server): stop a new setting from erasing a saved preset",
      "Исправил сохранение баланса: новые настройки не стирают сохранённый пресет."
    ],
    [
      "feat(core): give the gunner cannon a heat limit",
      "Добавил нагрев пушке стрелка: теперь нельзя стрелять без паузы."
    ],
    [
      "feat(server): measure the bot headless for balance work",
      "Добавил быстрый прогон бота для проверки баланса без браузера."
    ],
    [
      "fix(demo): aim the bot at where the turret will be",
      "Улучшил прицеливание демонстрационного бота."
    ],
    [
      "feat(display): show asteroids on the radar and in the HUD",
      "Добавил астероиды на радар и в игровой интерфейс."
    ],
    [
      "fix(demo): make the autopilot hunt instead of parking",
      "Автопилот теперь ищет цель, а не стоит без дела."
    ],
    [
      "feat(demo): grade the autopilot into three skill levels",
      "Добавил три уровня мастерства автопилота для проверки баланса."
    ]
  ]);
  if (known.has(subject)) return known.get(subject);
  if (subject.startsWith("fix(")) return "Исправил ошибку, которая мешала стабильной работе игры.";
  if (subject.startsWith("feat(display)")) return "Улучшил то, как игра выглядит на общем экране.";
  if (subject.startsWith("feat(core)")) return "Доработал важное боевое правило.";
  if (subject.startsWith("feat(server)")) return "Улучшил серверную часть и проверку игры.";
  if (subject.startsWith("docs") || subject.startsWith("docs("))
    return "Зафиксировал план и правила следующего улучшения.";
  return "Сделал подтверждённую техническую доработку игры.";
}

function narrationFor(day, claims) {
  return [
    `День разработки SpaceShip Defender за ${day}.`,
    "Показываю только то, что подтверждено коммитами.",
    ...claims.map((claim) => claim),
    "Дальше проверю это в живом бою и соберу следующий отчёт."
  ].join(" ");
}

function renderSsml(narration) {
  const escaped = narration
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("SpaceShip Defender", "Спэ́йсшип Дифэ́ндер")
    .replaceAll("в бою", "в бо́ю")
    .replaceAll("соберу", "соберу́");
  const phrases = escaped
    .split(/(?<=[.!?])\s+/u)
    .filter(Boolean)
    .map((phrase) => `<prosody rate="-8%" pitch="-2st">${phrase}</prosody><break time="350ms"/>`)
    .join("");
  return `<?xml version="1.0" encoding="utf-8"?><speak version="1.0" xml:lang="ru-RU">${phrases}</speak>`;
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
  const catalogSources = new Set(catalog.flatMap((entry) => entry.sources));
  const missing = [
    ...new Set(changed.filter(isUiSource).filter((path) => !catalogSources.has(path)))
  ];
  if (missing.length > 0) {
    status.push(`- Пропущен UI-кадр: нет записи каталога для ${missing.join(", ")}.`);
  }
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
      try {
        const page = await context.newPage();
        await page.goto(captureUrl(entry.url, baseUrl), { waitUntil: "networkidle" });
        const tab = page.getByTestId(entry.activateTestId);
        if (await tab.count()) {
          await page.waitForSelector(entry.readySelector, { timeout: 8_000 });
          await tab.click();
          await page.getByTestId(entry.panelTestId).waitFor({ state: "visible" });
        } else {
          const historicalTabs = page.locator("nav.tabs button");
          if ((await historicalTabs.count()) <= entry.tabIndex) {
            throw new Error("Эта вкладка ещё отсутствовала в выбранной ревизии.");
          }
          await historicalTabs.nth(entry.tabIndex).click();
          await page.waitForFunction(
            (tabIndex) =>
              document
                .querySelectorAll("nav.tabs button")
                .item(tabIndex)
                ?.classList.contains("tabs__tab--active") === true,
            entry.tabIndex
          );
        }
        const path = join(captures, `ui-${entry.id}.png`);
        await page.screenshot({ path, fullPage: true });
        results.push({ id: entry.id, title: entry.title, path });
      } catch (error) {
        status.push(`- UI-кадр ${entry.id} не снят: ${error.message}`);
      } finally {
        await context.close();
      }
    }
    status.push(`- Снято UI-кадров: ${results.length}.`);
    return results;
  } finally {
    await browser.close();
  }
}

function isUiSource(path) {
  return /^apps\/(admin|controller|display)\/src\/.*\.(?:tsx|ts|css)$/u.test(path);
}

function captureUrl(catalogUrl, overrideUrl) {
  const target = new URL(catalogUrl);
  const override = new URL(overrideUrl);
  target.protocol = override.protocol;
  target.host = override.host;
  return target.toString();
}

async function captureHistoricalUi(revision, changed) {
  if (!changed.some((path) => path.startsWith("apps/admin/src/"))) {
    status.push("- Админка за эту дату не менялась; исторический UI-кадр не требуется.");
    return [];
  }
  const worktreeRoot = resolve(root, ".daily-worktrees");
  const worktree = resolve(worktreeRoot, `${date}-admin-${process.pid}`);
  const serverPort = 38_000 + (process.pid % 1_000) * 2;
  const adminPort = serverPort + 1;
  let server;
  let admin;
  if (!worktree.startsWith(`${worktreeRoot}${sep}`))
    throw new Error("Unsafe historical admin worktree path.");
  await mkdir(worktreeRoot, { recursive: true });
  await run("git", ["worktree", "add", "--detach", worktree, revision], root);
  try {
    await runPackage(["install", "--offline", "--frozen-lockfile"], worktree);
    await runPackage(["--filter", "@spaceship-defender/server", "build"], worktree);
    server = startBackgroundProcess(process.execPath, ["apps/server/dist/index.js"], worktree, {
      HOST: "127.0.0.1",
      PORT: String(serverPort),
      GRACEFUL_SHUTDOWN: "false"
    });
    admin = startBackgroundProcess(
      process.execPath,
      [
        "apps/admin/node_modules/vite/bin/vite.js",
        "apps/admin",
        "--host",
        "127.0.0.1",
        "--port",
        String(adminPort),
        "--strictPort"
      ],
      worktree,
      { ADMIN_API_TARGET: `http://127.0.0.1:${String(serverPort)}` }
    );
    await Promise.all([
      waitForUrl(`http://127.0.0.1:${String(serverPort)}/health`, server),
      waitForUrl(`http://127.0.0.1:${String(adminPort)}`, admin)
    ]);
    const results = await captureUi(changed, `http://127.0.0.1:${String(adminPort)}`);
    status.push(`- Снято исторических UI-кадров админки: ${results.length}.`);
    return results;
  } finally {
    await Promise.all([stopBackgroundProcess(admin), stopBackgroundProcess(server)]);
    await run("git", ["worktree", "remove", "--force", worktree], root).catch(() => undefined);
    await rm(worktree, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(
      () => undefined
    );
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

async function createVoice(ssmlPath, outputPath) {
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
      "-SsmlPath",
      ssmlPath,
      "-OutputPath",
      outputPath
    ],
    root,
    undefined,
    true
  );
}

async function renderRawGameplay(source, target) {
  const ffmpeg = await findFfmpeg("ffmpeg.exe", "ffmpeg");
  await run(
    ffmpeg,
    [
      "-y",
      "-i",
      source,
      "-map",
      "0:v:0",
      "-an",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      target
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
    "-af",
    "apad",
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

function renderShotList(day, claims, ui, gameplay, rawGameplay, draft) {
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

function startBackgroundProcess(command, args, cwd, env) {
  return spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: "ignore",
    windowsHide: true
  });
}

async function waitForUrl(url, owner) {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    if (owner.exitCode !== null) throw new Error(`Service exited before ${url} was ready.`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The owned local service is still starting.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error(`Timed out waiting for ${url}.`);
}

async function stopBackgroundProcess(child) {
  if (child === undefined || child.exitCode !== null) return;
  child.kill();
  await Promise.race([
    new Promise((resolvePromise) => child.once("exit", resolvePromise)),
    new Promise((resolvePromise) => setTimeout(resolvePromise, 2_000))
  ]);
  if (child.exitCode === null && child.pid !== undefined && process.platform === "win32") {
    await run("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], root).catch(() => undefined);
  }
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
