import { describe, expect, it } from "vitest";

import { readServerConfig } from "./config.js";

describe("readServerConfig", () => {
  it("uses LAN-safe defaults", () => {
    expect(readServerConfig({})).toEqual({
      host: "0.0.0.0",
      port: 2567,
      reconnectionGraceSeconds: 30
    });
  });

  it("accepts explicit host and port", () => {
    expect(readServerConfig({ HOST: "127.0.0.1", PORT: "3000" })).toEqual({
      host: "127.0.0.1",
      port: 3000,
      reconnectionGraceSeconds: 30
    });
  });

  it.each(["0", "65536", "abc", "12.5"])("rejects invalid PORT=%s", (port) => {
    expect(() => readServerConfig({ PORT: port })).toThrow("PORT must be an integer");
  });

  it("supports a short reconnection grace period for integration tests", () => {
    expect(readServerConfig({ RECONNECTION_GRACE_SECONDS: "0.25" }).reconnectionGraceSeconds).toBe(
      0.25
    );
  });
});
