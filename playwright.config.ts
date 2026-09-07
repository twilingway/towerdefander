import { defineConfig } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * A preset path that never exists, so the suite runs on the built-in balance.
 *
 * Without it the server picks up whatever an operator last saved from the
 * console, and the arena, the hull and every wave come from that file: the same
 * spec passes on one machine and fails on the next for reasons that have
 * nothing to do with the code. The smoke harness has always done this; the
 * browser suite had not, and it took a preset with a doubled arena to notice.
 *
 * It only reaches a server this config starts. `reuseExistingServer` is on, so
 * a dev server already listening on the port is used as it stands, preset and
 * all - which is the other half of how a saved arena got into a spec. Run the
 * suite against a free port to be sure of what it is testing.
 */
const HERMETIC_BALANCE_PATH = join(tmpdir(), "spaceship-e2e-balance-never-written.json");

const externalServers = process.env.E2E_EXTERNAL_SERVERS === "1";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "list",
  use: {
    channel: "chrome",
    headless: true,
    trace: "retain-on-failure",
    // A hosted CI runner has no GPU, so Chrome falls back to SwiftShader and the
    // display renders in software. Setting this locally reproduces that machine
    // rather than guessing at it from a failed run's log.
    ...(process.env.E2E_SOFTWARE_GL === "1"
      ? { launchOptions: { args: ["--use-angle=swiftshader", "--disable-gpu"] } }
      : {})
  },
  ...(externalServers
    ? {}
    : {
        webServer: [
          {
            command: "node apps/server/dist/index.js",
            env: { BALANCE_PRESET_PATH: HERMETIC_BALANCE_PATH },
            url: "http://127.0.0.1:2567/health",
            reuseExistingServer: true,
            timeout: 30_000
          },
          {
            command: "pnpm.cmd --filter @spaceship-defender/display dev -- --strictPort",
            url: "http://127.0.0.1:5173",
            env: { VITE_VISIBLE_DEMO: "1" },
            reuseExistingServer: true,
            timeout: 30_000
          },
          {
            command: "pnpm.cmd --filter @spaceship-defender/controller dev -- --strictPort",
            url: "http://127.0.0.1:5174",
            reuseExistingServer: true,
            timeout: 30_000
          }
        ]
      })
});
