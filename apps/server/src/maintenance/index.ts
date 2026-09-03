import { MaintenanceWindow } from "./window.js";

let sharedWindow: MaintenanceWindow | undefined;

/**
 * Rooms are constructed by the matchmaker, so they reach the window through
 * this module-level accessor, the same way they reach the balance store.
 */
export function getMaintenanceWindow(): MaintenanceWindow {
  sharedWindow ??= new MaintenanceWindow();
  return sharedWindow;
}

export * from "./routes.js";
export * from "./window.js";
