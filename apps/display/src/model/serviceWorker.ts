/// <reference types="vite-plugin-pwa/vanillajs" />
import { offerAppUpdate, serviceWorkerSwitchedOff } from "./appUpdate.js";

/**
 * Registers the game's service worker, or removes it.
 *
 * Imported by `main.tsx` in production builds only: a worker registered on a
 * dev port outlives the dev server and serves a stale build there until it is
 * removed by hand, and every stand and harness here has a port of its own.
 */
export async function startServiceWorker(search: string): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  if (serviceWorkerSwitchedOff(search)) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
    const names = await caches.keys();
    await Promise.all(names.map((name) => caches.delete(name)));
    return;
  }
  const { registerSW } = await import("virtual:pwa-register");
  const updateServiceWorker = registerSW({
    onNeedRefresh() {
      offerAppUpdate(() => {
        void updateServiceWorker();
      });
    }
  });
}
