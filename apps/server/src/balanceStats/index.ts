import { readServerConfig } from "../config.js";
import { BatchRunner } from "./runner.js";
import { BatchStore } from "./store.js";

export { registerBalanceStatsRoutes, type BalanceStatsRouteOptions } from "./routes.js";
export { BatchStore } from "./store.js";
export { BatchAlreadyRunningError, BatchHarnessMissingError, BatchRunner } from "./runner.js";

let store: BatchStore | undefined;
let runner: BatchRunner | undefined;

/** One store and one runner per process, like the balance store above it. */
export function getBatchStore(): BatchStore {
  if (store === undefined) {
    const config = readServerConfig();
    store = new BatchStore({
      directory: config.statsBatchDirectory,
      keep: config.statsBatchKeep
    });
  }
  return store;
}

export function getBatchRunner(): BatchRunner {
  if (runner === undefined) {
    const config = readServerConfig();
    runner = new BatchRunner({
      store: getBatchStore(),
      presetPath: config.balancePresetPath,
      timeoutSeconds: config.statsBatchTimeoutSeconds,
      harnessPath: config.statsHarnessPath,
      guardUrl: config.statsProcessGuardUrl
    });
  }
  return runner;
}
