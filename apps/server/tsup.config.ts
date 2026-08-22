import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/benchmarks/runCombatRoomBenchmark.ts"],
  format: ["esm"],
  platform: "node",
  dts: true,
  clean: true,
  noExternal: ["@town-defenders/game-core"]
});
