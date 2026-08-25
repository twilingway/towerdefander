import { afterEach, describe, expect, it, vi } from "vitest";

import { BalanceRequestError, authorizationHeader, fetchBalance } from "./balanceClient.js";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body)
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("authorization header", () => {
  it("is omitted when no password is entered", () => {
    expect(authorizationHeader("")).toEqual({});
  });

  it("sends the fixed admin user with the entered password", () => {
    const header = authorizationHeader("secret");
    expect(header.Authorization).toBe(`Basic ${Buffer.from("admin:secret").toString("base64")}`);
  });
});

describe("fetchBalance", () => {
  it("explains a 401 in terms the operator can act on", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 401)));
    await expect(fetchBalance("")).rejects.toThrow(BalanceRequestError);
    await expect(fetchBalance("")).rejects.toThrow(/localhost/);
  });

  it("surfaces the server error message when the request is refused", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ error: "unlockWave must be positive" }, 400))
    );
    await expect(fetchBalance("")).rejects.toThrow("unlockWave must be positive");
  });

  it("rejects a payload that does not match the shared schema", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ version: 1, presets: [] })));
    await expect(fetchBalance("")).rejects.toThrow();
  });
});
