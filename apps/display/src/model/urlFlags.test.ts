import { describe, expect, it } from "vitest";

import { readDisplayUrlFlags } from "./urlFlags.js";

const release = { dev: false, visibleDemo: undefined } as const;
const development = { dev: true, visibleDemo: "1" } as const;

describe("readDisplayUrlFlags", () => {
  it("keeps the development-only switches shut in a release build", () => {
    const flags = readDisplayUrlFlags("?preview=1&demo=1&wave=5", release);

    expect(flags.preview).toBe(false);
    expect(flags.visibleDemo).toBe(false);
    expect(flags.allowStartWave).toBe(false);
    expect(flags.initialStartWave).toBe(1);
  });

  it("reads the whole set from one query string in development", () => {
    const flags = readDisplayUrlFlags("?preview=1&diag=1&demo=1&wave=5&ship=scout", development);

    expect(flags.preview).toBe(true);
    expect(flags.diagnostics).toBe(true);
    expect(flags.visibleDemo).toBe(true);
    expect(flags.initialStartWave).toBe(5);
    expect(flags.shipArchetypeId).toBe("scout");
  });

  it("answers an empty query with every switch off", () => {
    const flags = readDisplayUrlFlags("", development);

    expect(flags.preview).toBe(false);
    expect(flags.diagnostics).toBe(false);
    expect(flags.visibleDemo).toBe(false);
    expect(flags.initialStartWave).toBe(1);
    expect(flags.shipArchetypeId).toBeUndefined();
  });
});
