import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The console talks to the game server through this proxy, so requests keep the
// console origin: no CORS headers, and a dev machine reaches the API over
// loopback, which the server already treats as authorized.
export default defineConfig({
  envDir: "../..",
  plugins: [react()],
  server: {
    proxy: {
      "/admin": {
        target: process.env.ADMIN_API_TARGET ?? "http://localhost:2567",
        changeOrigin: false
      }
    }
  }
});
