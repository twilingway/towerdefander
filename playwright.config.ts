import { defineConfig } from "@playwright/test";

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
  webServer: [
    {
      command:
        "pnpm.cmd --filter @town-defenders/server build && pnpm.cmd --filter @town-defenders/server start",
      url: "http://127.0.0.1:2567/health",
      reuseExistingServer: true,
      timeout: 30_000
    },
    {
      command: "pnpm.cmd --filter @town-defenders/display dev -- --strictPort",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: true,
      timeout: 30_000
    },
    {
      command: "pnpm.cmd --filter @town-defenders/controller dev -- --strictPort",
      url: "http://127.0.0.1:5174",
      reuseExistingServer: true,
      timeout: 30_000
    }
  ]
});
