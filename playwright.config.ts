import { defineConfig } from "@playwright/test";

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
    trace: "retain-on-failure"
  },
  ...(externalServers
    ? {}
    : {
        webServer: [
          {
            command: "node apps/server/dist/index.js",
            url: "http://127.0.0.1:2567/health",
            reuseExistingServer: true,
            timeout: 30_000
          },
          {
            command: "pnpm.cmd --filter @spaceship-defender/display dev -- --strictPort",
            url: "http://127.0.0.1:5173",
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
