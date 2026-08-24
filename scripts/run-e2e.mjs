import { spawn } from "node:child_process";

const isWindows = process.platform === "win32";
const packageRunner = isWindows ? "pnpm.cmd" : "pnpm";
const serverPort = 35_678;
const displayPort = 35_173;
const controllerPort = 35_174;
const managedProcesses = [];

try {
  managedProcesses.push(
    startProcess("node", ["apps/server/dist/index.js"], {
      HOST: "127.0.0.1",
      PORT: String(serverPort),
      GRACEFUL_SHUTDOWN: "false",
      RECONNECTION_GRACE_SECONDS: "2"
    }),
    startProcess(
      "node",
      [
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
        VITE_CONTROLLER_URL: `http://127.0.0.1:${String(controllerPort)}`,
        VITE_VISIBLE_DEMO: "1"
      }
    ),
    startProcess(
      "node",
      [
        "apps/controller/node_modules/vite/bin/vite.js",
        "apps/controller",
        "--host",
        "127.0.0.1",
        "--port",
        String(controllerPort),
        "--strictPort"
      ],
      {
        VITE_GAME_SERVER_URL: `ws://127.0.0.1:${String(serverPort)}`
      }
    )
  );

  await Promise.all([
    waitForUrl(`http://127.0.0.1:${String(serverPort)}/health`),
    waitForUrl(`http://127.0.0.1:${String(displayPort)}`),
    waitForUrl(`http://127.0.0.1:${String(controllerPort)}`)
  ]);

  const result = await runProcess(packageRunner, ["exec", "playwright", "test"], {
    E2E_EXTERNAL_SERVERS: "1",
    E2E_DISPLAY_URL: `http://127.0.0.1:${String(displayPort)}`,
    E2E_CONTROLLER_URL: `http://127.0.0.1:${String(controllerPort)}`
  });
  process.exitCode = result;
} finally {
  await Promise.allSettled(managedProcesses.map(stopProcessTree));
}

function startProcess(command, arguments_, environment) {
  return spawn(command, arguments_, {
    cwd: process.cwd(),
    detached: !isWindows,
    env: { ...process.env, ...environment },
    shell: isWindows && command === packageRunner,
    stdio: "ignore",
    windowsHide: true
  });
}

async function runProcess(command, arguments_, environment) {
  const child = spawn(command, arguments_, {
    cwd: process.cwd(),
    env: { ...process.env, ...environment },
    shell: isWindows && command === packageRunner,
    stdio: "inherit",
    windowsHide: true
  });

  return await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => {
      resolve(code ?? 1);
    });
  });
}

async function waitForUrl(url) {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // The process is still starting.
    }
    await delay(100);
  }

  throw new Error(`Timed out waiting for ${url}`);
}

async function stopProcessTree(child) {
  if (child.pid === undefined || child.exitCode !== null) {
    return;
  }

  if (isWindows) {
    child.kill();
  } else {
    process.kill(-child.pid, "SIGTERM");
  }

  await Promise.race([
    new Promise((resolve) => {
      child.once("exit", resolve);
    }),
    delay(2_000)
  ]);
  if (child.exitCode === null) {
    child.kill("SIGKILL");
  }
}

async function delay(milliseconds) {
  await new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
