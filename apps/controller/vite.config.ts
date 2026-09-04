import react from "@vitejs/plugin-react";

import { defineConfig } from "vite";
import { metrikaPlugin } from "@spaceship-defender/client-shared/metrika";

/** The counter these two sites report to; the console is on the local network and reports nowhere. */
const METRIKA_COUNTER_ID = 112_278_966;

export default defineConfig({
  envDir: "../..",
  plugins: [react(), metrikaPlugin(METRIKA_COUNTER_ID)]
});
