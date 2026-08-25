import { isAbsolute } from "node:path";

import { describe, expect, it } from "vitest";

import { readServerConfig } from "./config.js";

describe("readServerConfig", () => {
  it("uses LAN-safe defaults", () => {
    const { balancePresetPath, ...rest } = readServerConfig({});
    expect(balancePresetPath).toContain("balance.json");
    expect(rest).toEqual({
      host: "0.0.0.0",
      port: 2567,
      reconnectionGraceSeconds: 30,
      lobbyTtlSeconds: 900,
      resultTtlSeconds: 600,
      zeroControllerTtlSeconds: 300,
      waveTtlSeconds: 1200,
      absoluteTtlSeconds: 43_200,
      statsPassword: undefined,
      balancePassword: undefined,
      gracefullyShutdown: true
    });
  });

  it("accepts explicit host and port", () => {
    const { balancePresetPath, ...rest } = readServerConfig({ HOST: "127.0.0.1", PORT: "3000" });
    expect(balancePresetPath).toContain("balance.json");
    expect(rest).toEqual({
      host: "127.0.0.1",
      port: 3000,
      reconnectionGraceSeconds: 30,
      lobbyTtlSeconds: 900,
      resultTtlSeconds: 600,
      zeroControllerTtlSeconds: 300,
      waveTtlSeconds: 1200,
      absoluteTtlSeconds: 43_200,
      statsPassword: undefined,
      balancePassword: undefined,
      gracefullyShutdown: true
    });
  });

  it("resolves the preset path against the server package, not the working directory", () => {
    const { balancePresetPath } = readServerConfig({});
    expect(isAbsolute(balancePresetPath)).toBe(true);
    expect(balancePresetPath.replaceAll("\\", "/")).toMatch(/apps\/server\/data\/balance\.json$/);
  });

  it("still honours an explicit BALANCE_PRESET_PATH", () => {
    expect(readServerConfig({ BALANCE_PRESET_PATH: "/srv/balance.json" }).balancePresetPath).toBe(
      "/srv/balance.json"
    );
  });

  it.each(["0", "65536", "abc", "12.5"])("rejects invalid PORT=%s", (port) => {
    expect(() => readServerConfig({ PORT: port })).toThrow("PORT must be an integer");
  });

  it("supports a short reconnection grace period for integration tests", () => {
    expect(readServerConfig({ RECONNECTION_GRACE_SECONDS: "0.25" }).reconnectionGraceSeconds).toBe(
      0.25
    );
  });

  it("allows test runners to disable graceful process shutdown", () => {
    expect(readServerConfig({ GRACEFUL_SHUTDOWN: "false" }).gracefullyShutdown).toBe(false);
  });

  it("accepts explicit lifecycle TTL values", () => {
    expect(
      readServerConfig({
        ROOM_LOBBY_TTL_SECONDS: "60",
        ROOM_RESULT_TTL_SECONDS: "45",
        ROOM_ZERO_CONTROLLER_TTL_SECONDS: "30",
        ROOM_WAVE_TTL_SECONDS: "90",
        ROOM_ABSOLUTE_TTL_SECONDS: "3600"
      })
    ).toMatchObject({
      lobbyTtlSeconds: 60,
      resultTtlSeconds: 45,
      zeroControllerTtlSeconds: 30,
      waveTtlSeconds: 90,
      absoluteTtlSeconds: 3600
    });
  });

  it("accepts the maximum wave TTL and rejects the first value above it", () => {
    expect(readServerConfig({ ROOM_WAVE_TTL_SECONDS: "86400" }).waveTtlSeconds).toBe(86_400);
    expect(() => readServerConfig({ ROOM_WAVE_TTL_SECONDS: "86401" })).toThrow(
      "ROOM_WAVE_TTL_SECONDS must be an integer"
    );
  });

  it.each([
    ["ROOM_LOBBY_TTL_SECONDS", "0"],
    ["ROOM_RESULT_TTL_SECONDS", "1.5"],
    ["ROOM_ZERO_CONTROLLER_TTL_SECONDS", "abc"],
    ["ROOM_WAVE_TTL_SECONDS", "0"],
    ["ROOM_ABSOLUTE_TTL_SECONDS", "604801"]
  ])("rejects invalid %s=%s", (name, value) => {
    expect(() => readServerConfig({ [name]: value })).toThrow(`${name} must be an integer`);
  });

  it("preserves a non-empty statistics password exactly", () => {
    expect(readServerConfig({ ROOM_STATS_PASSWORD: " secret with spaces " }).statsPassword).toBe(
      " secret with spaces "
    );
  });

  it("treats only an empty statistics password as disabled", () => {
    expect(readServerConfig({ ROOM_STATS_PASSWORD: "" }).statsPassword).toBeUndefined();
    expect(readServerConfig({ ROOM_STATS_PASSWORD: " " }).statsPassword).toBe(" ");
  });

  it("rejects a statistics password longer than 256 UTF-8 bytes", () => {
    expect(() => readServerConfig({ ROOM_STATS_PASSWORD: "я".repeat(129) })).toThrow(
      "ROOM_STATS_PASSWORD must be at most 256 UTF-8 bytes"
    );
  });
});
