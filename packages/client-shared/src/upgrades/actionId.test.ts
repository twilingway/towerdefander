import { describe, expect, it, vi } from "vitest";

import { createActionId } from "./actionId.js";

describe("createActionId", () => {
  it("creates a UUID action identity for an exact upgrade command", () => {
    expect(createActionId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
    );
  });

  it("still creates a UUID without randomUUID, as on a plain-http LAN address", () => {
    // `crypto.randomUUID` is secure-context only, so a controller opened over
    // http://<lan-ip> has just getRandomValues. Throwing here would break the
    // click handler before it can even show the pending vote.
    vi.stubGlobal("crypto", { getRandomValues: globalThis.crypto.getRandomValues.bind(crypto) });

    expect(createActionId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
    );

    vi.unstubAllGlobals();
  });
});
