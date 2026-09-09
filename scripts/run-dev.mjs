// Starts the four development servers, and stops them.
//
// `pnpm --parallel ... dev` started them fine and left them behind. The chain
// was `pnpm --parallel` -> `pnpm run dev` per app -> `node vite.js`, and a
// Ctrl+C in the terminal reaches the pnpm layers while the grandchild lives on
// holding its port. An audit of one afternoon found five orphaned vites on 5173
// alone, three generations of them, and the display's port had crawled to 5178
// because each new run found the last one still sitting there.
//
// So this spawns the four directly - two process layers fewer - with the same
// machinery the browser harnesses already use: `owned-process-guard.mjs` in each
// child so a `{type:"stop"}` message ends it, and a tree kill behind that for
// whatever ignores the message. Node's own `--watch` runs the server in a child
// of its own, which is exactly the case a plain kill misses and `/T` does not.
//
// Two more things it does that the pnpm version did not:
//
//   * `--strictPort` on every vite, so a busy port is an error instead of a
//     silent move to the next one. A dev server that quietly answers on 5178 is
//     how an afternoon gets lost.
//   * any child exiting takes the rest down, rather than leaving half a stack
//     running against a server that is already gone.
//
// Usage: pnpm dev
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
/** Absolute, because each child runs in its own working directory. */
const GUARD = new URL("./owned-process-guard.mjs", import.meta.url).href;
const isWindows = process.platform === "win32";

const SERVER_PORT = readServerPort();
const services = [
  {
    name: "server",
    cwd: "apps/server",
    // The app's own dev script, verbatim: its paths are relative to the package.
    args: ["--env-file-if-exists=../../.env.local", "--import", "tsx", "--watch", "src/index.ts"],
    port: SERVER_PORT
  },
  { name: "display", cwd: ".", args: viteArgs("apps/display", 5173), port: 5173 },
  { name: "controller", cwd: ".", args: viteArgs("apps/controller", 5174), port: 5174 },
  { name: "admin", cwd: ".", args: viteArgs("apps/admin", 5175), port: 5175 }
];

const children = [];
let stopping = false;

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    void stopAll(0);
  });
}

try {
  for (const service of services) await assertPortAvailable(service.name, service.port);
  for (const service of services) {
    const child = spawn(process.execPath, ["--import", GUARD, ...service.args], {
      cwd: new URL(`${service.cwd}/`, `file://${REPO_ROOT.replaceAll("\\", "/")}`),
      detached: !isWindows,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
      windowsHide: true
    });
    children.push({ name: service.name, child });
    prefix(service.name, child.stdout);
    prefix(service.name, child.stderr);
    child.once("exit", (code) => {
      if (stopping) return;
      console.error(`\n${service.name} exited with code ${String(code ?? 0)}; stopping the rest.`);
      void stopAll(1);
    });
  }
  console.log(
    [
      `server     http://localhost:${String(SERVER_PORT)}`,
      "display    http://localhost:5173",
      "controller http://localhost:5174",
      "admin      http://localhost:5175",
      "",
      "Ctrl+C stops all four, including whatever they spawned."
    ].join("\n")
  );
} catch (error) {
  console.error(String(error instanceof Error ? error.message : error));
  await stopAll(1);
}

function viteArgs(app, port) {
  return [
    // The binary rather than the `.bin` shim: one process layer fewer, and the
    // shim is what the tree kill used to lose track of.
    `${app}/node_modules/vite/bin/vite.js`,
    app,
    "--host",
    "0.0.0.0",
    "--port",
    String(port),
    "--strictPort"
  ];
}

/** `.env.local` owns the port in this repo, so the check has to read it. */
function readServerPort() {
  try {
    const found = /^\s*PORT\s*=\s*(\d+)/m.exec(
      readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    );
    if (found?.[1] !== undefined) return Number(found[1]);
  } catch {
    // No local env file; the server's own default stands.
  }
  return 2567;
}

function prefix(name, stream) {
  if (stream === null) return;
  let carry = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    const lines = (carry + chunk).split("\n");
    carry = lines.pop() ?? "";
    for (const line of lines) console.log(`${name} | ${line}`);
  });
  stream.on("end", () => {
    if (carry.length > 0) console.log(`${name} | ${carry}`);
  });
}

async function assertPortAvailable(name, port) {
  const free = await new Promise((done) => {
    const probe = createServer();
    probe.once("error", () => done(false));
    probe.listen(port, "0.0.0.0", () => {
      probe.close(() => done(true));
    });
  });
  if (free) return;
  throw new Error(
    [
      `Port ${String(port)} (${name}) is already in use, so nothing was started.`,
      "Most likely a dev server from an earlier run. To see who has it and stop it:",
      `  Get-NetTCPConnection -State Listen -LocalPort ${String(port)} | ForEach-Object { Get-Process -Id $_.OwningProcess }`,
      `  taskkill /PID <pid> /T /F`
    ].join("\n")
  );
}

async function stopAll(code) {
  if (stopping) return;
  stopping = true;
  await Promise.allSettled(children.reverse().map(({ child }) => stopProcessTree(child)));
  process.exit(code);
}

/**
 * Ask, then kill, then kill the tree. The message is enough for anything that
 * loaded the guard; the tree kill is for what it spawned in turn, which is where
 * `node --watch` keeps the process that actually holds the port.
 */
async function stopProcessTree(child) {
  if (child.pid === undefined || child.exitCode !== null) return;
  if (child.connected) {
    try {
      child.send({ type: "stop" });
    } catch {
      // Fall through to the PID.
    }
    await Promise.race([waitForExit(child), delay(2_000)]);
    if (child.exitCode !== null) return;
  }
  if (isWindows) {
    child.kill();
    await Promise.race([waitForExit(child), delay(1_500)]);
    if (child.exitCode === null) await terminateWindowsProcessTree(child.pid);
    return;
  }
  process.kill(-child.pid, "SIGTERM");
  await Promise.race([waitForExit(child), delay(1_500)]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

async function terminateWindowsProcessTree(processId) {
  const killer = spawn("taskkill.exe", ["/PID", String(processId), "/T", "/F"], {
    cwd: REPO_ROOT,
    stdio: "ignore",
    windowsHide: true
  });
  await waitForExit(killer).catch(() => undefined);
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
