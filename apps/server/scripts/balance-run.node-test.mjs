import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { tsImport } from "tsx/esm/api";

import { readTuning } from "./balance-run.mjs";

// The defaults live beside siblings imported with `.js` specifiers, so they load
// through tsx, as they do for the migrations the stand now applies.
const { createDefaultPresetsFile } = await tsImport("../src/balance/store.ts", import.meta.url);

test("a preset saved before the 19.5:9 frame is measured in the frame the room runs", async () => {
  // Balance file 57 stored its camera widths for the 16:9 frame. Read raw, 2500
  // across in the 19.5:9 geometry is a frame 1154 tall instead of 1406, and every
  // batch on such a file measured bots that saw a fifth less of the field.
  const document = createDefaultPresetsFile();
  document.version = 57;
  for (const preset of document.presets) {
    preset.tuning.cameraViewWidth = 2500;
    preset.tuning.arena.cameraViewWidth = 2500;
  }
  const directory = mkdtempSync(join(tmpdir(), "balance-run-"));
  const file = join(directory, "balance.json");
  try {
    writeFileSync(file, JSON.stringify(document));

    const { tuning } = await readTuning(file);

    assert.equal(tuning.cameraViewWidth, 3047);
    assert.equal(tuning.arena.cameraViewWidth, 3047);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("a file the server would refuse is refused rather than measured", async () => {
  const directory = mkdtempSync(join(tmpdir(), "balance-run-"));
  const file = join(directory, "balance.json");
  try {
    writeFileSync(file, JSON.stringify({ version: 58, activePresetId: "x", presets: "none" }));
    await assert.rejects(readTuning(file), /is not a balance document/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
