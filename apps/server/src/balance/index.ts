import { readServerConfig } from "../config.js";
import { BalanceStore } from "./store.js";

let sharedStore: BalanceStore | undefined;

/**
 * Rooms are constructed by the matchmaker, so they reach the store through this
 * module-level accessor the same way they reach the server config. Until
 * `load()` runs the store answers with built-in defaults.
 */
export function getBalanceStore(): BalanceStore {
  sharedStore ??= new BalanceStore({ filePath: readServerConfig().balancePresetPath });
  return sharedStore;
}

export * from "./routes.js";
export * from "./store.js";
