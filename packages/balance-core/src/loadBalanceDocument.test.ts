import { BALANCE_FILE_VERSION } from "@spaceship-defender/protocol";
import { describe, expect, it } from "vitest";

import { createDefaultPresetsFile } from "./defaults.ts";
import { loadBalanceDocument } from "./loadBalanceDocument.ts";
import { BALANCE_SEED_REVISION, loadBalanceSeed } from "./seed.ts";

describe("loadBalanceDocument", () => {
  /*
   * The one balance document that ships in the repository, read exactly the way
   * a device reads it. The release copies it into an empty volume and a client
   * build carries it, so a schema change that left it behind would be found by
   * an operator rather than by a test: the runtime file is gitignored, and a
   * machine that has already run the game hides the breakage.
   */
  it("keeps the committed seed loadable and playable", async () => {
    const raw = await loadBalanceSeed();

    const loaded = loadBalanceDocument(raw);

    expect(loaded.ok ? undefined : `${loaded.reason}: ${loaded.detail}`).toBeUndefined();
    if (!loaded.ok) return;
    expect(loaded.document.version).toBe(BALANCE_FILE_VERSION);
    expect(loaded.document.presets.length).toBeGreaterThan(0);
  });

  /*
   * A device tells the operator which promoted numbers it is carrying, so the
   * revision has to be a number and not whatever a hand-edit left behind. That
   * it matches the text file beside the seed is checked where a shell can read
   * both: `apps/server/scripts/promote-balance-seed.node-test.mjs`.
   */
  it("carries a seed revision", () => {
    expect(Number.isInteger(BALANCE_SEED_REVISION)).toBe(true);
    expect(BALANCE_SEED_REVISION).toBeGreaterThan(0);
  });

  /*
   * What a migration does to a genuinely old preset is settled in
   * `apps/server/src/balance/balance.test.ts`, against documents that were
   * actually written at those versions. Stamping today's defaults with an old
   * version proves nothing and fails honestly: the tick rescale would take a
   * document already written at 60 Hz three times over its own ceilings.
   */
  it("refuses a document the schema does not accept, and says where", () => {
    const loaded = loadBalanceDocument({ version: BALANCE_FILE_VERSION, presets: [] });

    expect(loaded.ok).toBe(false);
    if (!loaded.ok) {
      expect(loaded.reason).toBe("schema");
      expect(loaded.detail.length).toBeGreaterThan(0);
    }
  });

  it("refuses a document whose numbers cannot drive a simulation", () => {
    const document = createDefaultPresetsFile();
    const preset = document.presets[0];
    if (preset === undefined) throw new Error("default document has no preset");
    const broken = {
      ...document,
      presets: [{ ...preset, tuning: { ...preset.tuning, arenaRadius: -1 } }]
    };

    const loaded = loadBalanceDocument(broken);

    expect(loaded.ok).toBe(false);
    if (!loaded.ok) expect(loaded.detail.length).toBeGreaterThan(0);
  });
});
