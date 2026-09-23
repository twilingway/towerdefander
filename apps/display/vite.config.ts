import react from "@vitejs/plugin-react";

import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { metrikaPlugin } from "@spaceship-defender/client-shared/metrika";

/** The counter these two sites report to; the console is on the local network and reports nowhere. */
const METRIKA_COUNTER_ID = 112_278_966;

/** The dark of the rotate notice and the icons, so the splash and the game meet without a flash. */
const SPACE_DARK = "#060a14";

/*
 * The installable shell (openspec/changes/pwa-shell/design.md).
 *
 * `prompt`: a new build waits until the player agrees on the start screen - an
 * automatic update would reload a page in the middle of a wave. Registration is
 * in `model/serviceWorker.ts`, production only, so no dev port ever gets one.
 *
 * `PWA_SELF_DESTROY=1` builds the emergency worker: same name, removes itself
 * and every cache. Nothing else may change in this block when it is used, or
 * the old worker is not replaced.
 */
const pwa = VitePWA({
  registerType: "prompt",
  injectRegister: false,
  selfDestroying: process.env.PWA_SELF_DESTROY === "1",
  manifest: {
    name: "SpaceShip Defender",
    short_name: "SpaceShip Defender",
    lang: "ru",
    start_url: "/",
    display: "fullscreen",
    orientation: "landscape",
    background_color: SPACE_DARK,
    theme_color: SPACE_DARK,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable"
      }
    ]
  },
  workbox: {
    // Everything a solo fight needs without a network. Music stays out: an
    // `<audio>` element asks for it in ranges, which the cache cannot answer.
    globPatterns: ["**/*.{js,css,html,json,webp,png,jpg,svg,woff2,mp3}"],
    globIgnores: ["**/theme-*"],
    cleanupOutdatedCaches: true,
    // Pages from the network first, so a release arrives with the first load
    // online; the cached shell only when there is no network at all.
    navigateFallback: null,
    runtimeCaching: [
      {
        urlPattern: ({ request }) => request.mode === "navigate",
        handler: "NetworkFirst",
        options: {
          cacheName: "pages",
          networkTimeoutSeconds: 4,
          precacheFallback: { fallbackURL: "index.html" }
        }
      }
    ]
  }
});

export default defineConfig({
  envDir: "../..",
  build: {
    /*
     * Old enough for the Redmi 4X's Chrome 101 and a television's WebView. The
     * default target let the minifier rewrite every media query into range
     * syntax - `(width>=34rem)` - which Chrome reads only from 104: the phone
     * silently dropped every responsive rule, and the start screen stacked its
     * tiles and scrolled its footer away.
     */
    cssTarget: ["chrome87", "safari14"]
  },
  optimizeDeps: {
    include: ["phaser"]
  },
  plugins: [react(), metrikaPlugin(METRIKA_COUNTER_ID), pwa]
});
