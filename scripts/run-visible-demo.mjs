import { spawn } from "node:child_process";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { basename, resolve, sep } from "node:path";

const isWindows = process.platform === "win32";
const packageRunner = isWindows ? "pnpm.cmd" : "pnpm";
const serverPort = 36_567;
const displayPort = 36_173;
const managedProcesses = [];
const commandStartedAt = Date.now();
let interrupted = false;
let demoProcess;
let forcedDemoExitCode;
let forcedDemoTermination;
let ownedChromeProfile;

const handleInterrupt = () => {
  interrupted = true;
  requestDemoStop();
};
process.once("SIGINT", handleInterrupt);
process.once("SIGTERM", handleInterrupt);

try {
  const buildCode = await runProcess(packageRunner, [
    "--filter",
    "@spaceship-defender/server",
    "build"
  ]);
  if (buildCode !== 0) throw new Error("Server build failed; visible demo was not started.");
  await access("apps/server/dist/index.js");
  if (interrupted) throw new Error("Visible demo stopped before startup.");
  await Promise.all([assertPortAvailable(serverPort), assertPortAvailable(displayPort)]);

  const presetPath = await shortenIntermission();
  const server = startProcess(
    process.execPath,
    ["--import", "./scripts/owned-process-guard.mjs", "apps/server/dist/index.js"],
    {
      HOST: "127.0.0.1",
      PORT: String(serverPort),
      GRACEFUL_SHUTDOWN: "false",
      RECONNECTION_GRACE_SECONDS: "1",
      ...(presetPath === undefined ? {} : { BALANCE_PRESET_PATH: presetPath })
    }
  );
  const display = startProcess(
    process.execPath,
    [
      "--import",
      "./scripts/owned-process-guard.mjs",
      "apps/display/node_modules/vite/bin/vite.js",
      "apps/display",
      "--host",
      "127.0.0.1",
      "--port",
      String(displayPort),
      "--strictPort"
    ],
    {
      VITE_GAME_SERVER_URL: `ws://127.0.0.1:${String(serverPort)}`,
      VITE_CONTROLLER_URL: "http://127.0.0.1:36174",
      VITE_VISIBLE_DEMO: "1"
    }
  );
  managedProcesses.push(server, display);

  await Promise.all([
    waitForOwnedUrl(`http://127.0.0.1:${String(serverPort)}/health`, server),
    waitForOwnedUrl(`http://127.0.0.1:${String(displayPort)}/?demo=1`, display)
  ]);
  if (interrupted) throw new Error("Visible demo stopped during service startup.");

  demoProcess = startDemoProcess({
    DEMO_DISPLAY_URL: `http://127.0.0.1:${String(displayPort)}/?demo=1`,
    DEMO_GAME_SERVER_URL: `ws://127.0.0.1:${String(serverPort)}`,
    DEMO_BALANCE_URL: `http://127.0.0.1:${String(serverPort)}`,
    DEMO_HEADLESS: process.env.DEMO_HEADLESS ?? "0",
    DEMO_VERIFY: process.env.DEMO_VERIFY ?? "0"
  });
  demoProcess.on("message", (message) => {
    if (message?.type === "owned-profile") {
      ownedChromeProfile = validateOwnedChromeProfile(message.profileDirectory);
      return;
    }
    if (message?.type !== "force-tree" || demoProcess?.pid === undefined) return;
    forcedDemoExitCode = Number.isInteger(message.exitCode) ? message.exitCode : 1;
    forcedDemoTermination ??= terminateOwnedProcessTree(demoProcess);
  });
  managedProcesses.push(demoProcess);
  const observedDemoCode = await waitForDemoExit(demoProcess);
  await forcedDemoTermination;
  const demoCode = forcedDemoExitCode ?? observedDemoCode;
  if (!interrupted && demoCode !== 0) process.exitCode = demoCode;
} catch (error) {
  if (!interrupted) {
    process.exitCode = 1;
    console.error(error instanceof Error ? error.message : String(error));
  }
} finally {
  process.removeListener("SIGINT", handleInterrupt);
  process.removeListener("SIGTERM", handleInterrupt);
  await Promise.allSettled(managedProcesses.reverse().map(stopProcessTree));
  await cleanupOwnedChromeProfile().catch(() => undefined);
}

const TICK_MS = 50;
const OPERATOR_PRESET_PATH = "apps/server/data/balance.json";

/**
 * DEMO_INTERMISSION=2 shortens the wait between waves for this run only. The
 * console has the same knob, but nothing starts the console during a visible
 * demo, and the operator's own preset must come back untouched afterwards — so
 * the override goes into a throwaway copy the server is pointed at instead.
 */
async function shortenIntermission() {
  const requested = process.env.DEMO_INTERMISSION;
  if (requested === undefined) return undefined;
  const seconds = Number(requested);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error(`DEMO_INTERMISSION must be a positive number of seconds, got "${requested}".`);
  }

  let document;
  try {
    document = JSON.parse(await readFile(OPERATOR_PRESET_PATH, "utf8"));
  } catch {
    // No saved preset: the server plays its built-in defaults and there is
    // nothing here to copy, so leave it to do that.
    console.log("DEMO_INTERMISSION ignored: no saved balance preset to copy.");
    return undefined;
  }

  const ticks = Math.max(1, Math.round((seconds * 1000) / TICK_MS));
  for (const preset of document.presets ?? []) {
    if (preset?.tuning !== undefined) preset.tuning.intermissionTicks = ticks;
  }
  const directory = await mkdtemp(`${resolve(tmpdir())}${sep}spaceship-demo-`);
  const copy = `${directory}${sep}balance.json`;
  await writeFile(copy, JSON.stringify(document), "utf8");
  console.log(`Intermission shortened to ${String(seconds)}s for this demo run.`);
  return copy;
}

function startProcess(command, arguments_, environment) {
  return spawn(command, arguments_, {
    cwd: process.cwd(),
    detached: !isWindows,
    env: { ...process.env, ...environment },
    stdio: ["ignore", "inherit", "inherit", "ipc"],
    windowsHide: true
  });
}

function startDemoProcess(environment) {
  return spawn(process.execPath, ["apps/controller/scripts/visible-demo.mjs"], {
    cwd: process.cwd(),
    detached: !isWindows,
    env: { ...process.env, ...environment },
    stdio: ["inherit", "inherit", "inherit", "ipc"],
    windowsHide: true
  });
}

async function runProcess(command, arguments_) {
  const child = spawn(command, arguments_, {
    cwd: process.cwd(),
    env: process.env,
    shell: isWindows && command === packageRunner,
    stdio: "inherit",
    windowsHide: true
  });
  const outcome = await Promise.race([waitForExit(child), delay(120_000).then(() => "timeout")]);
  if (outcome !== "timeout") return outcome;
  if (child.pid !== undefined) {
    child.kill();
    await Promise.race([waitForExit(child), delay(2_000)]);
    if (child.exitCode === null) {
      if (isWindows) await terminateWindowsProcessTree(child.pid);
      else child.kill("SIGKILL");
    }
  }
  throw new Error("Server build exceeded its 120 second deadline.");
}

async function waitForOwnedUrl(url, owner) {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    if (owner.exitCode !== null) throw new Error(`Owned process exited before ${url} was ready.`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Owned process is still starting.
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for owned service ${url}. The demo port may be busy.`);
}

function waitForExit(child) {
  if (child.exitCode !== null) return Promise.resolve(child.exitCode);
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
}

async function waitForDemoExit(child) {
  if (process.env.DEMO_VERIFY !== "1") return await waitForExit(child);
  let timeout;
  const remainingMs = Math.max(1, 165_000 - (Date.now() - commandStartedAt));
  const expired = new Promise((resolve) => {
    timeout = setTimeout(() => resolve("timeout"), remainingMs);
  });
  const outcome = await Promise.race([waitForExit(child), expired]);
  clearTimeout(timeout);
  if (outcome !== "timeout") return outcome;
  requestDemoStop();
  await Promise.race([waitForExit(child), delay(5_000)]);
  throw new Error("Visible demo command exceeded its 165 second deadline.");
}

function requestDemoStop() {
  if (demoProcess?.connected !== true) return;
  try {
    demoProcess.send({ type: "stop" });
  } catch {
    // The demo is already closing.
  }
}

function assertPortAvailable(port) {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.unref();
    probe.once("error", () => {
      reject(new Error(`Visible demo port ${String(port)} is already in use.`));
    });
    probe.listen(port, "127.0.0.1", () => {
      probe.close(resolve);
    });
  });
}

async function stopProcessTree(child) {
  if (child.pid === undefined || child.exitCode !== null) return;
  if (child.connected) {
    try {
      child.send({ type: "stop" });
    } catch {
      // Continue to the owned PID fallback.
    }
    await Promise.race([waitForExit(child), delay(2_000)]);
    if (child.exitCode !== null) return;
  }
  if (isWindows) {
    child.kill();
    await Promise.race([waitForExit(child), delay(2_000)]);
    if (child.exitCode === null) await terminateWindowsProcessTree(child.pid);
    return;
  }
  process.kill(-child.pid, "SIGTERM");
  await Promise.race([new Promise((resolve) => child.once("exit", resolve)), delay(2_000)]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

async function terminateWindowsProcessTree(processId) {
  const killer = spawn("taskkill.exe", ["/PID", String(processId), "/T", "/F"], {
    cwd: process.cwd(),
    stdio: "ignore",
    windowsHide: true
  });
  await waitForExit(killer).catch(() => undefined);
}

async function terminateOwnedProcessTree(child) {
  if (child.pid === undefined || child.exitCode !== null) return;
  if (isWindows) await terminateWindowsProcessTree(child.pid);
  else process.kill(-child.pid, "SIGKILL");
}

function validateOwnedChromeProfile(profileDirectory) {
  if (typeof profileDirectory !== "string") {
    throw new Error("Demo reported an invalid Chrome profile path.");
  }
  const resolvedProfile = resolve(profileDirectory);
  const resolvedTempRoot = `${resolve(tmpdir())}${sep}`;
  if (
    !resolvedProfile.startsWith(resolvedTempRoot) ||
    !basename(resolvedProfile).startsWith("spaceship-visible-demo-")
  ) {
    throw new Error("Demo reported a Chrome profile outside the owned temp namespace.");
  }
  return resolvedProfile;
}

async function cleanupOwnedChromeProfile() {
  if (ownedChromeProfile === undefined) return;
  await rm(ownedChromeProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
