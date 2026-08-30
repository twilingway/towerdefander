import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";

import { Client } from "@colyseus/sdk";
import {
  PROTOCOL_VERSION,
  clientMessage,
  serverErrorSchema,
  serverLatencyProbeSchema,
  serverMessage
} from "@spaceship-defender/protocol";
import { chromium } from "@playwright/test";

import {
  createAutopilotMemory,
  extrapolateWorld,
  measureAngularRates,
  planGunner,
  planPilot,
  planShield,
  runWaveKey
} from "./visible-demo-policy.mjs";

const STEP_MS = 50;
const TELEMETRY_MS = 50;
const VERIFY_TIMEOUT_MS = 150_000;
const STATUS_EVENT = "spaceship-visible-demo-status";
/**
 * The page reads the wave from its own address, so a demo of the boss is a URL
 * rather than five cleared waves. Applied to whatever base is in play, because
 * the launcher always passes an explicit `DEMO_DISPLAY_URL` — appending it only
 * to the fallback meant the option was silently dropped on every real run.
 */
function withStartWave(base, startWave) {
  if (startWave === undefined || startWave.trim().length === 0) return base;
  const url = new URL(base);
  url.searchParams.set("wave", startWave.trim());
  return url.toString();
}

const displayUrl = withStartWave(
  process.env.DEMO_DISPLAY_URL ?? "http://127.0.0.1:36173/?demo=1",
  process.env.DEMO_START_WAVE
);
console.log(`Visible demo display: ${displayUrl}`);
const gameServerUrl = process.env.DEMO_GAME_SERVER_URL ?? "ws://127.0.0.1:36567";
const balanceUrl = process.env.DEMO_BALANCE_URL ?? "http://127.0.0.1:36567";
const levelOverride = process.env.DEMO_BOT_LEVEL;
const LEVEL_LABELS = { rookie: "Новичок", veteran: "Ветеран", ace: "Ас" };
const verificationMode = process.env.DEMO_VERIFY === "1";
const headless = process.env.DEMO_HEADLESS === "1";
const captureDirectory = optionalDailyArtifactDirectory(
  process.env.DEMO_CAPTURE_DIR,
  "DEMO_CAPTURE_DIR"
);
const recordVideoDirectory = optionalDailyArtifactDirectory(
  process.env.DEMO_RECORD_VIDEO_DIR,
  "DEMO_RECORD_VIDEO_DIR"
);

let browser;
let page;
let externalChromeProcess;
let externalChromeProfile;
const roomsByRole = new Map();
const ownedRooms = new Set();
let cleaningUp = false;
let stopRequested = false;
let failure;
let paused = false;
let generation = 0;
let pilotSequence = 0;
let gunnerSequence = 0;
let shieldSequence = 0;
let shieldActive = false;
let autopilot;
let autopilotMemory;
let autopilotMemoryKey;
let latestTelemetry;
let latestWorld;
/** Turret and hull angular speed measured between the last two raw frames. */
let angularRates = { turret: 0, heading: 0 };
let lastTelemetryAt = 0;
let resultObservedAt;
let readySentForRun;
let neutralizedPhaseKey;
let lastStatusAt = 0;
let lastCadenceLogAt = 0;
let stopNeutralizationPromise;
let controlWindowStartedAt = Date.now();
let controlBatches = 0;
let measuredControlHz = 0;
const upgradedRunWaves = new Set();
const verification = {
  combat: false,
  movement: false,
  projectile: false,
  mgFire: false,
  shield: false,
  intermission: false,
  upgrades: false,
  wave2: false,
  cadence: false
};
class DemoStopped extends Error {}
const requestStop = () => {
  paused = true;
  measuredControlHz = 0;
  generation += 1;
  stopRequested = true;
  if (roomsByRole.size === 3 && stopNeutralizationPromise === undefined) {
    stopNeutralizationPromise = neutralize().catch(() => undefined);
  }
};
process.once("SIGINT", requestStop);
process.once("SIGTERM", requestStop);
process.on("message", (message) => {
  if (message?.type === "stop") requestStop();
});

try {
  const launchedBrowser = headless
    ? await launchHeadlessBrowser()
    : await launchExternalVisibleChrome();
  browser = launchedBrowser.browser;
  externalChromeProcess = launchedBrowser.chromeProcess;
  externalChromeProfile = launchedBrowser.profileDirectory;
  abortIfStopped();
  browser.on("disconnected", () => {
    if (!cleaningUp) requestStop();
  });
  const context = launchedBrowser.context;
  page = launchedBrowser.page;
  abortIfStopped();
  page.on("close", () => {
    if (!cleaningUp) requestStop();
  });
  await page.exposeFunction("__spaceshipVisibleDemoCommand", (command) => {
    if (command === "pause") void pauseAutomation();
    else if (command === "resume") void resumeAutomation();
    else if (command === "stop") requestStop();
  });

  autopilot = await loadAutopilot();
  console.log(`Autopilot level: ${autopilot.level} (${autopilot.source})`);

  await page.goto(displayUrl, { waitUntil: "domcontentloaded" });
  if (!headless) await keepVisiblePageActive(context, page);
  abortIfStopped();
  await page.getByRole("button", { name: "Создать комнату" }).click();
  abortIfStopped();
  const roomId = (await page.locator(".room-code").innerText()).trim();
  if (roomId.length === 0) throw new Error("Display did not publish a room code.");

  await publishStatus("connecting", "Подключаем pilot, gunner и shield", 0, "lobby");
  for (const playerName of ["Demo Pilot", "Demo Gunner", "Demo Shield"]) {
    const room = await new Client(gameServerUrl).joinById(roomId, {
      role: "controller",
      protocolVersion: PROTOCOL_VERSION,
      playerName
    });
    ownedRooms.add(room);
    abortIfStopped();
    attachLatencyResponder(room);
    attachFailureHandlers(room);
    await waitFor(() => room.state.players?.get(room.sessionId)?.role !== undefined, 4_000);
    const role = room.state.players.get(room.sessionId).role;
    if (roomsByRole.has(role)) throw new Error(`Duplicate authoritative role ${role}.`);
    roomsByRole.set(role, room);
    abortIfStopped();
  }
  assertCrew();
  abortIfStopped();
  await captureFrame("lobby");

  for (const room of roomsByRole.values()) room.send(clientMessage.ready, envelope(room));
  await waitFor(
    () => pilotRoom().state.phase === "active" && encounter().phase === "combat",
    8_000
  );
  const startedAt = Date.now();
  // The autopilot acts only on the world picture the display publishes, so a
  // demo that never publishes one has to fail loudly instead of flying blind.
  try {
    await waitFor(async () => {
      await refreshTelemetry();
      return latestWorld !== undefined;
    }, 5_000);
  } catch (error) {
    if (error instanceof DemoStopped) throw error;
    throw new Error(
      "Display published no autopilot world picture; check that the demo build is enabled."
    );
  }
  const startingPosition = latestTelemetry?.spaceship;
  verification.combat = true;
  await publishStatus("running", "Автопилот ведёт бой", encounter().waveNumber, "combat");
  if (!headless) await page.bringToFront();

  while (!stopRequested) {
    if (failure !== undefined) throw failure;
    if (verificationMode && Date.now() - startedAt > VERIFY_TIMEOUT_MS) {
      throw new Error(`Demo verification timed out: ${JSON.stringify(verification)}.`);
    }

    if (Date.now() - lastTelemetryAt >= TELEMETRY_MS) await refreshTelemetry();
    if (stopRequested) break;
    if (failure !== undefined) throw failure;
    observeVerification(startingPosition);
    if (
      latestTelemetry !== undefined &&
      latestTelemetry.shieldActive &&
      latestTelemetry.friendlyProjectiles + latestTelemetry.mgProjectiles > 0
    ) {
      await captureFrame("combat");
    }
    if (!headless && latestTelemetry !== undefined && Date.now() - lastCadenceLogAt >= 5_000) {
      lastCadenceLogAt = Date.now();
      console.log(
        `Visible cadence: ${JSON.stringify({
          renderFps: latestTelemetry.renderFps,
          snapshotHz: latestTelemetry.snapshotHz,
          controlHz: latestTelemetry.controlHz,
          visibilityState: latestTelemetry.visibilityState,
          focused: latestTelemetry.focused
        })}`
      );
    }
    const currentEncounter = encounter();

    if (currentEncounter.phase === "combat") {
      resultObservedAt = undefined;
      neutralizedPhaseKey = undefined;
      if (!paused) sendCombatInputs(generation);
    } else if (currentEncounter.phase === "intermission") {
      verification.intermission = true;
      await neutralizeForPhase(currentEncounter);
      await voteAllUpgrades(currentEncounter.waveNumber);
    } else if (currentEncounter.phase === "result") {
      await neutralizeForPhase(currentEncounter);
      resultObservedAt ??= Date.now();
      if (
        !stopRequested &&
        Date.now() - resultObservedAt >= 3_000 &&
        readySentForRun !== pilotRoom().state.runNumber
      ) {
        readySentForRun = pilotRoom().state.runNumber;
        for (const room of roomsByRole.values()) room.send(clientMessage.ready, envelope(room));
      }
    }

    if (Date.now() - lastStatusAt >= 250) {
      lastStatusAt = Date.now();
      await publishStatus(
        paused ? "paused" : "running",
        paused
          ? "Автопилот остановлен; бой на сервере продолжается"
          : statusMessage(currentEncounter),
        currentEncounter.waveNumber,
        currentEncounter.phase
      );
    }

    if (verificationMode && Object.values(verification).every(Boolean)) {
      console.log(`Visible demo verification passed: ${JSON.stringify(verification)}`);
      requestStop();
      continue;
    }
    await delay(STEP_MS);
  }
} catch (error) {
  if (!(error instanceof DemoStopped) && !stopRequested) {
    failure = error instanceof Error ? error : new Error(String(error));
    process.exitCode = 1;
    console.error(`Visible demo failed: ${failure.message}`);
  }
} finally {
  cleaningUp = true;
  process.removeListener("SIGINT", requestStop);
  process.removeListener("SIGTERM", requestStop);
  await (stopNeutralizationPromise ?? neutralize().catch(() => undefined));
  const rooms = [...ownedRooms];
  const leaveOutcomes = await Promise.race([
    Promise.all(
      rooms.map(async (room) => {
        try {
          await room.leave(true);
          return { room, succeeded: true };
        } catch {
          return { room, succeeded: false };
        }
      })
    ),
    delay(2_000).then(() => undefined)
  ]);
  const roomsToForceClose =
    leaveOutcomes === undefined
      ? rooms
      : leaveOutcomes.filter((outcome) => !outcome.succeeded).map((outcome) => outcome.room);
  for (const room of roomsToForceClose) {
    try {
      room.reconnection.enabled = false;
      room.connection.close();
    } catch {
      // The failed transport is already closed.
    }
  }
  if (page !== undefined && !page.isClosed()) {
    try {
      page.once("dialog", (dialog) => void dialog.accept().catch(() => undefined));
      const closeButton = page.getByRole("button", { name: "Закрыть комнату" }).first();
      if (await closeButton.isVisible()) await closeButton.click({ timeout: 1_000 });
    } catch {
      // The browser may have been closed by the user.
    }
  }
  const browserClosed =
    browser === undefined
      ? true
      : await Promise.race([
          browser
            .close()
            .then(() => true)
            .catch(() => false),
          delay(5_000).then(() => false)
        ]);
  if (browserClosed) await cleanupExternalChromeProfile().catch(() => undefined);
  const finalExitCode = process.exitCode ?? 0;
  if (!browserClosed && headless) {
    if (process.connected) process.disconnect();
    process.exit(finalExitCode);
  }
  if (!browserClosed && process.send !== undefined) {
    process.send({ type: "force-tree", exitCode: finalExitCode });
    await new Promise(() => undefined);
  }
  if (process.connected) process.disconnect();
  process.exit(finalExitCode);
}

async function launchHeadlessBrowser() {
  const launched = await chromium.launch({ headless: true, channel: "chrome" });
  const context = await launched.newContext({
    viewport: { width: 1600, height: 900 },
    ...(recordVideoDirectory === undefined
      ? {}
      : { recordVideo: { dir: recordVideoDirectory, size: { width: 1600, height: 900 } } })
  });
  return { browser: launched, context, page: await context.newPage() };
}

function optionalDailyArtifactDirectory(value, variableName) {
  if (value === undefined || value.length === 0) return undefined;
  const target = resolve(value);
  const dailyArtifactsRoot = resolve(process.cwd(), "artifacts", "daily-videos");
  if (!target.startsWith(`${dailyArtifactsRoot}${sep}`)) {
    throw new Error(`${variableName} must be inside artifacts/daily-videos.`);
  }
  return target;
}

async function captureFrame(name) {
  if (captureDirectory === undefined || page === undefined) return;
  const target = resolve(captureDirectory, `${name}.png`);
  if (!target.startsWith(`${captureDirectory}${sep}`)) {
    throw new Error("Capture path escaped the requested directory.");
  }
  try {
    await access(target);
    return;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await mkdir(captureDirectory, { recursive: true });
  await page.screenshot({ path: target });
}

async function launchExternalVisibleChrome() {
  const chromeExecutable = await findChromeExecutable();
  const profileDirectory = await mkdtemp(join(tmpdir(), "spaceship-visible-demo-"));
  const chromeProcess = spawn(
    chromeExecutable,
    [
      "--remote-debugging-port=0",
      `--user-data-dir=${profileDirectory}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-session-crashed-bubble",
      "--start-maximized",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
      "--disable-features=CalculateNativeWinOcclusion,IntensiveWakeUpThrottling",
      "--ignore-gpu-blocklist",
      "--enable-gpu-rasterization",
      "--app=about:blank"
    ],
    { stdio: "ignore", windowsHide: false }
  );
  externalChromeProcess = chromeProcess;
  externalChromeProfile = profileDirectory;
  if (process.send !== undefined) process.send({ type: "owned-profile", profileDirectory });
  const devToolsPort = await waitForDevToolsPort(profileDirectory, chromeProcess);
  const launched = await chromium.connectOverCDP(`http://127.0.0.1:${String(devToolsPort)}`);
  const context = launched.contexts().at(0);
  if (context === undefined) throw new Error("External Chrome did not expose a default context.");
  const page = context.pages().at(0) ?? (await context.newPage());
  await keepVisiblePageActive(context, page);
  return { browser: launched, context, page, chromeProcess, profileDirectory };
}

async function findChromeExecutable() {
  const candidates = [
    join(process.env.PROGRAMFILES ?? "", "Google", "Chrome", "Application", "chrome.exe"),
    join(process.env["PROGRAMFILES(X86)"] ?? "", "Google", "Chrome", "Application", "chrome.exe"),
    join(process.env.LOCALAPPDATA ?? "", "Google", "Chrome", "Application", "chrome.exe")
  ];
  for (const candidate of candidates) {
    if (candidate.length === 0) continue;
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next standard Google Chrome installation path.
    }
  }
  throw new Error("Google Chrome was not found in a standard Windows installation path.");
}

async function waitForDevToolsPort(profileDirectory, chromeProcess) {
  const activePortPath = join(profileDirectory, "DevToolsActivePort");
  for (let attempt = 0; attempt < 150; attempt += 1) {
    if (chromeProcess.exitCode !== null) {
      throw new Error("External Google Chrome exited before CDP became available.");
    }
    try {
      const [portLine] = (await readFile(activePortPath, "utf8")).split(/\r?\n/u);
      const port = Number(portLine);
      if (Number.isInteger(port) && port > 0 && port <= 65_535) return port;
    } catch {
      // Chrome has not written DevToolsActivePort yet.
    }
    await delay(50);
  }
  throw new Error("Timed out waiting for external Google Chrome CDP endpoint.");
}

async function keepVisiblePageActive(context, activePage) {
  await activePage.bringToFront();
  const session = await context.newCDPSession(activePage);
  try {
    await session.send("Page.bringToFront");
    await session.send("Emulation.setFocusEmulationEnabled", { enabled: true });
    await session.send("Page.setWebLifecycleState", { state: "active" });
  } finally {
    await session.detach();
  }
}

async function cleanupExternalChromeProfile() {
  if (externalChromeProfile === undefined) return;
  if (externalChromeProcess?.exitCode === null) {
    externalChromeProcess.kill();
    await Promise.race([
      new Promise((resolveExit) => externalChromeProcess.once("exit", resolveExit)),
      delay(2_000)
    ]);
  }
  const resolvedProfile = resolve(externalChromeProfile);
  const resolvedTempRoot = `${resolve(tmpdir())}${sep}`;
  if (
    !resolvedProfile.startsWith(resolvedTempRoot) ||
    !basename(resolvedProfile).startsWith("spaceship-visible-demo-")
  ) {
    throw new Error("Refusing to remove an unexpected Chrome profile path.");
  }
  await rm(resolvedProfile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}

function sendCombatInputs(expectedGeneration) {
  if (paused || expectedGeneration !== generation || latestWorld === undefined) return;
  const nowMs = Date.now();
  const world = extrapolateWorld(latestWorld, nowMs, {
    angularRates,
    turretRate: autopilot.turretRate
  });
  const { profile } = autopilot;
  const memory = autopilotMemoryFor(world.waveNumber);
  const options = {
    archetypes: autopilot.archetypes,
    cannonSpeed: autopilot.cannonSpeed,
    mgSpeed: autopilot.mgSpeed,
    turretRate: autopilot.turretRate,
    nowMs
  };

  const pilot = planPilot(world, profile, memory, options);
  pilotSequence += 1;
  pilotRoom().send(clientMessage.pilotInput, {
    ...envelope(pilotRoom()),
    sequence: pilotSequence,
    vector: pilot.vector,
    // The same spin and push a live pilot's keyboard sends, so the bot flies
    // the helm the crew flies rather than an absolute course of its own.
    turn: pilot.turn,
    thrust: pilot.thrust,
    mgFiring: pilot.mgFiring
  });
  const gunner = planGunner(world, profile, memory, options);
  gunnerSequence += 1;
  gunnerRoom().send(clientMessage.gunnerInput, {
    ...envelope(gunnerRoom()),
    sequence: gunnerSequence,
    aim: gunner.aim,
    firing: gunner.firing
  });
  const shield = planShield(world, profile, memory);
  shieldActive = shield.active;
  shieldSequence += 1;
  shieldRoom().send(clientMessage.shieldInput, {
    ...envelope(shieldRoom()),
    sequence: shieldSequence,
    aim: shield.aim,
    active: shield.active
  });
  recordControlBatch();
}

/**
 * A fresh scratch space per run and wave: an intermission wipes the world, so a
 * target committed before it must not survive into the next one. Seeding from
 * the same key keeps the aim jitter reproducible across replays.
 */
function autopilotMemoryFor(waveNumber) {
  const key = runWaveKey(pilotRoom().state.runNumber, waveNumber);
  if (autopilotMemoryKey !== key) {
    autopilotMemoryKey = key;
    autopilotMemory = createAutopilotMemory(seedFromKey(key));
  }
  return autopilotMemory;
}

function seedFromKey(key) {
  let hash = 2_166_136_261;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

/**
 * The demo plays by the preset the console edits, so the operator can watch the
 * same wave through a weaker or a sharper pilot. A missing or malformed preset
 * is a hard failure rather than a silent fallback to numbers nobody chose.
 */
async function loadAutopilot() {
  const endpoint = `${balanceUrl.replace(/\/+$/u, "")}/admin/balance`;
  let document;
  try {
    const response = await fetch(endpoint);
    if (!response.ok) {
      throw new Error(`${String(response.status)} ${response.statusText}`);
    }
    document = await response.json();
  } catch (error) {
    throw new Error(
      `Could not read the balance preset from ${endpoint}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  const preset = document?.presets?.find(({ id }) => id === document.activePresetId);
  const tuning = preset?.tuning;
  if (tuning?.autopilot === undefined) {
    throw new Error(`Balance preset from ${endpoint} carries no autopilot section.`);
  }
  const requested = levelOverride ?? tuning.autopilot.level;
  const profile = tuning.autopilot.profiles[requested];
  if (profile === undefined) {
    throw new Error(`Balance preset has no autopilot profile named "${String(requested)}".`);
  }
  return {
    level: requested,
    source: levelOverride === undefined ? "preset" : "DEMO_BOT_LEVEL",
    profile,
    archetypes: tuning.enemyArchetypes ?? {},
    // Both muzzle velocities are preset values, so the lead solution has to
    // use the ones this run will actually fire with.
    cannonSpeed: tuning.projectileSpeedPerSecond,
    mgSpeed: tuning.mgProjectileSpeedPerSecond,
    // How fast the turret can actually swing decides whether a crossing target
    // is winnable at all, so the bot has to read it rather than assume it.
    turretRate: tuning.turretMaxAngularSpeedPerSecond
  };
}

async function pauseAutomation() {
  if (paused || cleaningUp) return;
  paused = true;
  measuredControlHz = 0;
  generation += 1;
  await neutralize();
  const current = safeEncounter();
  await publishStatus(
    "paused",
    "Автопилот остановлен; серверная симуляция продолжается",
    current?.waveNumber ?? 0,
    current?.phase ?? "lobby"
  );
}

async function resumeAutomation() {
  if (!paused || cleaningUp) return;
  generation += 1;
  controlWindowStartedAt = Date.now();
  controlBatches = 0;
  measuredControlHz = 0;
  paused = false;
}

async function neutralize() {
  if (roomsByRole.size !== 3) return;
  shieldActive = false;
  pilotSequence += 1;
  bestEffortSend(pilotRoom(), clientMessage.pilotInput, {
    ...envelope(pilotRoom()),
    sequence: pilotSequence,
    vector: { x: 0, y: 0 },
    mgFiring: false
  });
  gunnerSequence += 1;
  bestEffortSend(gunnerRoom(), clientMessage.gunnerInput, {
    ...envelope(gunnerRoom()),
    sequence: gunnerSequence,
    aim: { x: 0, y: 0 },
    firing: false
  });
  shieldSequence += 1;
  bestEffortSend(shieldRoom(), clientMessage.shieldInput, {
    ...envelope(shieldRoom()),
    sequence: shieldSequence,
    aim: { x: 0, y: 0 },
    active: false
  });
}

async function neutralizeForPhase(currentEncounter) {
  const key = `${String(pilotRoom().state.runNumber)}:${currentEncounter.phase}`;
  if (neutralizedPhaseKey === key) return;
  neutralizedPhaseKey = key;
  await neutralize();
}

async function voteAllUpgrades(waveNumber) {
  const upgradeKey = runWaveKey(pilotRoom().state.runNumber, waveNumber);
  if (stopRequested || upgradedRunWaves.has(upgradeKey)) return;
  await waitFor(
    () => teamUpgrade()?.hasOffer === true && teamUpgrade().offer.cards.length === 3,
    3_000
  );
  if (stopRequested) return;
  // Copy the offer out of the schema: the server reuses those instances for the
  // next offer, so live references would mutate between the three votes.
  const state = teamUpgrade();
  const firstCard = state.offer.cards.at(0);
  if (firstCard === undefined) throw new Error("Team upgrade offer has no cards.");
  const offer = {
    offerId: state.offer.offerId,
    waveNumber: state.offer.waveNumber,
    upgradeId: firstCard.upgradeId
  };
  // The crew votes unanimously so the demo always shows one paid upgrade.
  for (const [role, room] of roomsByRole) {
    if (stopRequested) return;
    room.send(clientMessage.upgradeVote, {
      ...envelope(room),
      actionId: randomUUID(),
      waveNumber: offer.waveNumber,
      offerId: offer.offerId,
      upgradeId: offer.upgradeId,
      revision: 1
    });
    await waitFor(() => teamUpgrade().votes.get(role)?.upgradeId === offer.upgradeId, 3_000);
  }
  upgradedRunWaves.add(upgradeKey);
  verification.upgrades = true;
}

function teamUpgrade() {
  return pilotRoom().state.game?.teamUpgrade;
}

async function refreshTelemetry() {
  lastTelemetryAt = Date.now();
  if (page === undefined || page.isClosed()) return;
  try {
    latestTelemetry = await page.locator('[data-testid="spaceship-world"]').evaluate((element) => {
      const parse = (name) => Number(element.getAttribute(name));
      const overlay = element.ownerDocument.querySelector('[data-testid="visible-demo-overlay"]');
      const parseOverlay = (name) => Number(overlay?.getAttribute(name));
      const targetId = element.getAttribute("data-demo-target-id") ?? "";
      const threatId = element.getAttribute("data-demo-threat-id") ?? "";
      return {
        spaceship: {
          x: parse("data-spaceship-x"),
          y: parse("data-spaceship-y")
        },
        target:
          targetId.length === 0
            ? undefined
            : {
                entityId: targetId,
                x: parse("data-demo-target-x"),
                y: parse("data-demo-target-y"),
                velocityX: parse("data-demo-target-velocity-x"),
                velocityY: parse("data-demo-target-velocity-y")
              },
        threat:
          threatId.length === 0
            ? undefined
            : {
                entityId: threatId,
                x: parse("data-demo-threat-x"),
                y: parse("data-demo-threat-y"),
                velocityX: parse("data-demo-threat-velocity-x"),
                velocityY: parse("data-demo-threat-velocity-y")
              },
        friendlyProjectiles: parse("data-friendly-projectile-count"),
        mgProjectiles: parse("data-mg-projectile-count"),
        shieldActive: element.getAttribute("data-shield-active") === "true",
        shieldEnergy: parse("data-shield-energy"),
        visibilityState: element.ownerDocument.visibilityState,
        focused: element.ownerDocument.hasFocus(),
        renderFps: parseOverlay("data-render-fps"),
        snapshotHz: parseOverlay("data-snapshot-hz"),
        controlHz: parseOverlay("data-control-hz")
      };
    });
    const observed = await page.evaluate(() => window.__spaceshipDemoWorld);
    // Rates are measured between raw frames only. The extrapolated picture
    // carries these angles forward itself, so feeding one back in would
    // compound the estimate on top of itself.
    if (observed !== undefined && observed.sampledAtMs !== latestWorld?.sampledAtMs) {
      angularRates = measureAngularRates(latestWorld, observed);
    }
    latestWorld = observed;
  } catch (error) {
    if (stopRequested || page.isClosed()) return;
    throw error;
  }
}

function observeVerification(startingPosition) {
  if (latestTelemetry === undefined) return;
  verification.projectile ||= latestTelemetry.friendlyProjectiles > 0;
  verification.mgFire ||= latestTelemetry.mgProjectiles > 0;
  verification.shield ||= latestTelemetry.shieldActive;
  verification.movement ||=
    startingPosition !== undefined &&
    Math.hypot(
      latestTelemetry.spaceship.x - startingPosition.x,
      latestTelemetry.spaceship.y - startingPosition.y
    ) > 10;
  verification.wave2 ||= encounter().phase === "combat" && encounter().waveNumber >= 2;
  verification.cadence ||=
    latestTelemetry.renderFps > 0 &&
    latestTelemetry.snapshotHz > 0 &&
    latestTelemetry.controlHz > 0;
}

function statusMessage(currentEncounter) {
  const level = LEVEL_LABELS[autopilot?.level] ?? String(autopilot?.level ?? "—");
  if (currentEncounter.phase === "intermission") return `${level} · выбираем улучшения экипажа`;
  if (currentEncounter.phase === "result") return `${level} · результат боя, готовим повтор`;
  const target = autopilotMemory?.target;
  return target === undefined
    ? `${level} · ищем цель и держим дистанцию`
    : `${level} · атакуем ${target.entityId}`;
}

async function publishStatus(state, message, waveNumber, phase) {
  if (page === undefined || page.isClosed()) return;
  await page
    .evaluate(
      ({ eventName, detail }) => {
        window.dispatchEvent(new CustomEvent(eventName, { detail }));
      },
      {
        eventName: STATUS_EVENT,
        detail: { state, message, waveNumber, phase, controlHz: measuredControlHz }
      }
    )
    .catch(() => undefined);
}

function recordControlBatch(now = Date.now()) {
  controlBatches += 1;
  const elapsedMs = now - controlWindowStartedAt;
  if (elapsedMs < 1_000) return;
  measuredControlHz = Math.round((controlBatches * 1000) / elapsedMs);
  controlWindowStartedAt = now;
  controlBatches = 0;
}

function attachLatencyResponder(room) {
  room.onMessage(serverMessage.latencyProbe, (payload) => {
    const result = serverLatencyProbeSchema.safeParse(payload);
    if (!result.success) return;
    room.send(clientMessage.latencyPong, {
      protocolVersion: PROTOCOL_VERSION,
      roomId: room.roomId,
      probeId: result.data.probeId
    });
  });
}

function attachFailureHandlers(room) {
  room.onMessage(serverMessage.error, (payload) => {
    const result = serverErrorSchema.safeParse(payload);
    if (!result.success) {
      reportFailure(new Error("Demo controller received malformed server:error."));
      return;
    }
    if (result.data.code === "invalid_phase" || result.data.code === "action_not_available") {
      return;
    }
    reportFailure(new Error(`Controller command failed: ${result.data.code}.`));
  });
  room.onLeave(() => {
    if (!cleaningUp) reportFailure(new Error(`Demo controller ${room.sessionId} disconnected.`));
  });
  room.onError((code, message) => {
    if (!cleaningUp) reportFailure(new Error(`Controller error ${String(code)}: ${message}`));
  });
}

function reportFailure(error) {
  failure ??= error;
  paused = true;
  generation += 1;
  if (roomsByRole.size === 3 && stopNeutralizationPromise === undefined) {
    stopNeutralizationPromise = neutralize().catch(() => undefined);
  }
}

function bestEffortSend(room, messageType, payload) {
  try {
    room.send(messageType, payload);
  } catch {
    // Continue neutralizing the other connected roles.
  }
}

function envelope(room) {
  return {
    protocolVersion: PROTOCOL_VERSION,
    roomId: room.roomId,
    playerId: room.sessionId,
    runNumber: room.state.runNumber
  };
}

function assertCrew() {
  for (const role of ["pilot", "gunner", "shield"]) {
    if (!roomsByRole.has(role)) throw new Error(`Authoritative ${role} role was not assigned.`);
  }
}

function pilotRoom() {
  return requiredRoom("pilot");
}

function gunnerRoom() {
  return requiredRoom("gunner");
}

function shieldRoom() {
  return requiredRoom("shield");
}

function requiredRoom(role) {
  const room = roomsByRole.get(role);
  if (room === undefined) throw new Error(`Missing ${role} room.`);
  return room;
}

function encounter() {
  const value = pilotRoom().state.game?.encounter;
  if (value === undefined) throw new Error("Controller has no encounter projection.");
  return value;
}

function safeEncounter() {
  return roomsByRole.get("pilot")?.state?.game?.encounter;
}

async function waitFor(predicate, timeoutMs, intervalMs = 25) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    abortIfStopped();
    if (failure !== undefined) throw failure;
    if (await predicate()) return;
    await delay(intervalMs);
  }
  throw new Error(`Visible demo timed out after ${String(timeoutMs)} ms.`);
}

function abortIfStopped() {
  if (stopRequested) throw new DemoStopped("Visible demo stopped by user.");
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
