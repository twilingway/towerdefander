// Opens a run that flies itself, and shows it.
//
// The room drives every seat nobody is sitting in, so a display alone is a
// whole crew: one window, three panels' worth of decisions, no phones. That is
// the thing to watch when a change touches the autopilot, the picture, or the
// pacing between them - `demo:visible` answers a different question, because
// its crew are three SDK clients rather than the room itself.
//
// Reuses a stand that is already up. Starting one costs a rebuild and a port
// dance, and the common case is an operator who has `pnpm dev` running and
// wants to watch a run in it. A stand this script started is a stand this
// script stops; one it found is left alone.
//
// Usage:
//   pnpm watch:bots
//   pnpm watch:bots -- --wave=8 --ship=blade --crew=3
import { spawn } from "node:child_process";
import { connect } from "node:net";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const GUARD = new URL("./owned-process-guard.mjs", import.meta.url).href;
const isWindows = process.platform === "win32";

const SERVER_PORT = 2567;
const DISPLAY_PORT = 5173;
/** The whole point of the harness: without it a room with empty seats never starts. */
const STAND_ENV = { ALLOW_BOT_CREW: "true", ALLOW_START_WAVE: "true" };
const SHIP_BUTTONS = { guardian: "Страж", blade: "Клинок", bastion: "Бастион" };

const option = (name, fallback) =>
  process.argv.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3) ??
  fallback;

const crew = Number(option("crew", "3"));
const startWave = Number(option("wave", "0"));
const ship = option("ship", "");
if (![1, 2, 3].includes(crew)) throw new Error(`--crew must be 1, 2 or 3; got ${String(crew)}.`);
if (ship !== "" && SHIP_BUTTONS[ship] === undefined)
  throw new Error(`--ship must be one of ${Object.keys(SHIP_BUTTONS).join(", ")}.`);

let stand;
let browser;
let stopping = false;

for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => void stop(0));

try {
  const standWasUp = await isListening(DISPLAY_PORT);
  if (standWasUp) {
    console.log(`Using the stand already on :${String(DISPLAY_PORT)}.`);
  } else {
    console.log("No stand on the usual ports; starting one with a bot crew.");
    stand = spawn(process.execPath, ["--import", GUARD, "scripts/run-dev.mjs"], {
      cwd: REPO_ROOT,
      detached: !isWindows,
      env: { ...process.env, ...STAND_ENV },
      stdio: ["ignore", "inherit", "inherit", "ipc"],
      windowsHide: true
    });
    stand.once("exit", (code) => {
      if (!stopping) {
        console.error(`The stand exited with code ${String(code ?? 0)}.`);
        void stop(1);
      }
    });
    await waitForPort(DISPLAY_PORT, 90_000);
    await waitForPort(SERVER_PORT, 90_000);
  }

  browser = await chromium.launch({ channel: "chrome", headless: false });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.goto(`http://127.0.0.1:${String(DISPLAY_PORT)}/`, { waitUntil: "load" });
  await page.getByRole("button", { name: "Кампания I: Завеса" }).click();
  await page.getByRole("button", { name: "Общий экран" }).click();
  await page
    .getByRole("button", { name: `${String(crew)} игрок`, exact: false })
    .first()
    .click();
  if (ship !== "") await page.getByRole("button", { name: SHIP_BUTTONS[ship] }).click();
  if (startWave > 1) {
    const field = page.getByLabel("Начать с волны (для тестов)");
    if ((await field.count()) === 0)
      throw new Error(
        "The stand was started without ALLOW_START_WAVE=true, so --wave cannot be set."
      );
    await field.fill(String(startWave));
  }
  await page.getByRole("button", { name: "В бой" }).click();
  await page.waitForSelector(".room-code", { timeout: 30_000 });
  console.log(`Room ${String(await page.locator(".room-code").first().innerText())} is open.`);

  try {
    await page.getByText("Корабль в бою").first().waitFor({ timeout: 30_000 });
  } catch {
    throw new Error(
      standWasUp
        ? "The run never started. A stand started without ALLOW_BOT_CREW=true waits for real players; stop it and let this script start its own."
        : "The run never started, and this script set ALLOW_BOT_CREW itself - so the fault is in the room, not in the flag."
    );
  }
  console.log("The crew is flying. Close the window or press Ctrl+C to stop.");
  await page.waitForEvent("close", { timeout: 0 });
  await stop(0);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  await stop(1);
}

async function stop(code) {
  if (stopping) return;
  stopping = true;
  await browser?.close().catch(() => undefined);
  if (stand !== undefined) await stopStand(stand);
  process.exit(code);
}

/** Ask, then kill, then kill the tree - the shape `run-dev.mjs` uses, for the same reason. */
async function stopStand(child) {
  if (child.pid === undefined || child.exitCode !== null) return;
  if (child.connected) {
    try {
      child.send({ type: "stop" });
    } catch {
      // Fall through to the PID.
    }
    await Promise.race([waitForExit(child), delay(3_000)]);
    if (child.exitCode !== null) return;
  }
  if (isWindows) {
    child.kill();
    await Promise.race([waitForExit(child), delay(1_500)]);
    if (child.exitCode === null) {
      const killer = spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
        cwd: REPO_ROOT,
        stdio: "ignore",
        windowsHide: true
      });
      await waitForExit(killer).catch(() => undefined);
    }
    return;
  }
  process.kill(-child.pid, "SIGTERM");
  await Promise.race([waitForExit(child), delay(1_500)]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

function isListening(port) {
  return new Promise((done) => {
    const probe = connect({ host: "127.0.0.1", port }, () => {
      probe.end();
      done(true);
    });
    probe.once("error", () => done(false));
    probe.setTimeout(1_000, () => {
      probe.destroy();
      done(false);
    });
  });
}

async function waitForPort(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isListening(port)) return;
    await delay(250);
  }
  throw new Error(`Port ${String(port)} never came up.`);
}

function waitForExit(child) {
  if (child.exitCode !== null) return Promise.resolve(child.exitCode);
  return new Promise((done, fail) => {
    child.once("error", fail);
    child.once("exit", (code) => done(code ?? 1));
  });
}

function delay(milliseconds) {
  return new Promise((done) => setTimeout(done, milliseconds));
}
