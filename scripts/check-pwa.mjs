/**
 * `pnpm pwa:check` - the display's service worker, end to end, on a production
 * build (openspec/changes/pwa-shell).
 *
 * Outside `pnpm check` on purpose: it builds the display four times and drives
 * Chrome through a network cut. Run it when `vite.config.ts`, the routes or a
 * heavy asset change, and before a release that touches any of them - a broken
 * worker in production sits on every player's device until the emergency build
 * goes out.
 *
 * What it proves, each on its own step:
 *   1. a production build registers the worker and precaches the game;
 *   2. with the network cut, the start screen loads and a solo run plays;
 *   3. a new build arriving mid-fight neither reloads the page nor offers
 *      itself there, and is offered on the start screen, where pressing it
 *      switches to it;
 *   4. `?sw=off` removes the worker and empties the caches;
 *   5. the `PWA_SELF_DESTROY=1` build removes the worker from a device that has it.
 *
 * Its own port, so no worker it registers ever lands on a port a stand uses,
 * and a normal build is left in `apps/display/dist` whatever happened.
 */
import { spawn } from "node:child_process";
import { createServer } from "node:net";

import { chromium } from "@playwright/test";

const isWindows = process.platform === "win32";
const packageRunner = isWindows ? "pnpm.cmd" : "pnpm";
const port = 36_480;
const base = `http://127.0.0.1:${String(port)}`;
const failures = [];
let preview;
let browser;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function check(passed, label) {
  console.log(`${passed ? "ok  " : "FAIL"} ${label}`);
  if (!passed) failures.push(label);
}

try {
  await assertPortAvailable(port);
  await build({ VITE_BUILD_VERSION: "pwa-check-1" });
  preview = spawn(
    process.execPath,
    [
      "--import",
      "./scripts/owned-process-guard.mjs",
      "apps/display/node_modules/vite/bin/vite.js",
      "preview",
      "apps/display",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--strictPort"
    ],
    {
      cwd: process.cwd(),
      detached: !isWindows,
      env: process.env,
      stdio: ["ignore", "ignore", "inherit", "ipc"],
      windowsHide: true
    }
  );
  await waitForUrl(`${base}/`, preview);

  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();

  // 1. Registered and precached.
  await page.goto(`${base}/`, { waitUntil: "load" });
  await page.evaluate(() => navigator.serviceWorker.ready);
  const cacheNames = await page.evaluate(async () => await caches.keys());
  check(
    cacheNames.some((name) => name.startsWith("workbox-precache")),
    "a production build registers the worker and precaches the game"
  );
  // What DevTools' Application panel reports about the manifest.
  const devtools = await context.newCDPSession(page);
  const manifest = await devtools.send("Page.getAppManifest");
  const manifestErrors = manifest.errors.filter((entry) => entry.critical === 1);
  check(
    manifest.url.endsWith("/manifest.webmanifest") && manifestErrors.length === 0,
    `the manifest is found and parses without errors${manifestErrors.length > 0 ? `: ${manifestErrors.map((entry) => entry.message).join("; ")}` : ""}`
  );
  await devtools.detach();

  // 2. Offline.
  await context.setOffline(true);
  await page.reload({ waitUntil: "load" });
  check(
    await page.getByTestId("start-footer").isVisible(),
    "offline: the start screen loads from the cache"
  );
  await page.goto(`${base}/solo`, { waitUntil: "load" });
  // The arena's own canvas: the readable `spaceship-world` exists only in a dev build.
  const world = page.locator(".battlefield-canvas canvas");
  const worldShown = await world
    .waitFor({ timeout: 30_000 })
    .then(() => true)
    .catch(() => false);
  check(worldShown, "offline: a solo run draws its arena");
  const timer = page.getByTestId("timer-frame");
  const firstReading = await timer.textContent().catch(() => null);
  await delay(2_500);
  check(
    firstReading !== null && (await timer.textContent()) !== firstReading,
    "offline: the solo run's clock is running"
  );
  // The music plays through an `<audio>` element, which asks for byte ranges.
  const musicUrl = await page.evaluate(
    () =>
      performance
        .getEntriesByType("resource")
        .map((entry) => entry.name)
        .find((name) => /\/theme-[^/]+\.(mp3|ogg)$/.test(name)) ?? null
  );
  const playedMs = await page.evaluate(async (url) => {
    if (url === null) return -1;
    const track = new Audio(url);
    track.muted = true;
    try {
      await track.play();
    } catch {
      return -2;
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    const at = track.currentTime;
    track.pause();
    return Math.round(at * 1000);
  }, musicUrl);
  check(
    playedMs > 500,
    `offline: the music plays from the cache (${String(playedMs)} ms of ${musicUrl ?? "no track found"})`
  );
  await context.setOffline(false);

  // 3. A release arrives mid-fight.
  await page.goto(`${base}/solo`, { waitUntil: "load" });
  await world.waitFor({ timeout: 30_000 });
  let reloads = 0;
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) reloads += 1;
  });
  await build({ VITE_BUILD_VERSION: "pwa-check-2" });
  await askForUpdate(page);
  await delay(5_000);
  check(reloads === 0, "a new build does not reload a page mid-fight");
  check(
    (await page.getByTestId("update-notice").count()) === 0,
    "a new build is not offered in a fight"
  );
  await page.goto(`${base}/`, { waitUntil: "load" });
  check(
    ((await page.getByTestId("start-footer").textContent()) ?? "").includes("pwa-check-2"),
    "a plain load online brings the new build, without pressing anything"
  );
  await askForUpdate(page);
  const notice = page.getByTestId("update-notice");
  const offered = await notice
    .waitFor({ timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  check(offered, "the new build is offered on the start screen");
  if (offered) {
    await Promise.all([page.waitForEvent("load", { timeout: 20_000 }), notice.click()]);
    check(
      ((await page.getByTestId("start-footer").textContent()) ?? "").includes("pwa-check-2"),
      "pressing it switches the page to the new build"
    );
  }

  // 4. The reset flag.
  await page.goto(`${base}/?sw=off`, { waitUntil: "load" });
  check(await becomesClean(page), "?sw=off removes the worker and empties the caches");

  // 5. The emergency build.
  await page.goto(`${base}/`, { waitUntil: "load" });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await build({ VITE_BUILD_VERSION: "pwa-check-2", PWA_SELF_DESTROY: "1" });
  await askForUpdate(page);
  await page.reload({ waitUntil: "load" });
  check(
    await becomesClean(page),
    "the self-destroying build removes the worker from a device that has it"
  );
} catch (error) {
  failures.push(error instanceof Error ? error.message : String(error));
  console.error(error);
} finally {
  await browser?.close().catch(() => undefined);
  if (preview !== undefined) await stopProcessTree(preview);
  // Never leave the emergency build, or a numbered test build, lying in dist.
  await build({}).catch((error) => {
    failures.push(`rebuilding a normal dist failed: ${String(error)}`);
  });
}

if (failures.length > 0) {
  console.error(`\npwa:check failed: ${String(failures.length)} step(s)`);
  process.exit(1);
}
console.log("\npwa:check passed");

/** Asks the browser to look for a new worker now rather than on its own schedule. */
async function askForUpdate(page) {
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    await registration?.update();
  });
}

/** Whether, within a few seconds, this origin has no worker and no caches left. */
async function becomesClean(page) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const left = await page.evaluate(async () => ({
      workers: (await navigator.serviceWorker.getRegistrations()).length,
      caches: (await caches.keys()).length
    }));
    if (left.workers === 0 && left.caches === 0) return true;
    await delay(500);
  }
  return false;
}

function build(environment) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      packageRunner,
      ["--filter", "@spaceship-defender/display", "exec", "vite", "build"],
      {
        cwd: process.cwd(),
        env: { ...process.env, ...environment },
        shell: isWindows,
        stdio: "ignore",
        windowsHide: true
      }
    );
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`display build exited with ${String(code)}`));
    });
  });
}

async function waitForUrl(url, owner) {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    if (owner.exitCode !== null) throw new Error(`The preview exited before ${url} was ready.`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The preview is still starting.
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for the preview at ${url}.`);
}

function assertPortAvailable(portToProbe) {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.unref();
    probe.once("error", () => {
      reject(new Error(`pwa:check port ${String(portToProbe)} is already in use.`));
    });
    probe.listen(portToProbe, "127.0.0.1", () => {
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
      // Fall through to the owned PID.
    }
    await Promise.race([new Promise((resolve) => child.once("exit", resolve)), delay(2_000)]);
    if (child.exitCode !== null) return;
  }
  if (isWindows) {
    const killer = spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true
    });
    await new Promise((resolve) => killer.once("exit", resolve));
    return;
  }
  process.kill(-child.pid, "SIGTERM");
}
