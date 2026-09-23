import { PROTOCOL_VERSION } from "@spaceship-defender/protocol";
import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchServerStatus, networkClosure } from "./serverStatus.js";

const url = "ws://game.test";
const signal = new AbortController().signal;

function answer(body: unknown, ok = true): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok, json: () => Promise.resolve(body) }))
  );
}

describe("the server's own answer", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads an offline device as offline, without asking", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect((await fetchServerStatus(url, signal, false)).reach).toBe("offline");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("reads a failed request as a server that does not answer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("refused")))
    );
    expect((await fetchServerStatus(url, signal, true)).reach).toBe("unreachable");
    answer({}, false);
    expect((await fetchServerStatus(url, signal, true)).reach).toBe("unreachable");
  });

  it("reads another protocol as a build too old, even with fields it does not know", async () => {
    answer({ status: "ok", protocolVersion: PROTOCOL_VERSION + 1, somethingNew: true });
    expect((await fetchServerStatus(url, signal, true)).reach).toBe("outdated");
  });

  it("passes the maintenance window through when the versions agree", async () => {
    const maintenance = { active: true, secondsRemaining: 600 };
    answer({ status: "ok", protocolVersion: PROTOCOL_VERSION, maintenance });
    expect(await fetchServerStatus(url, signal, true)).toEqual({ reach: "online", maintenance });
  });
});

describe("why the network modes are closed", () => {
  it("names the announced window first, then the connection", () => {
    expect(networkClosure({ active: true, secondsRemaining: 60 }, "offline")).toBe("maintenance");
    expect(networkClosure(undefined, "offline")).toBe("offline");
    expect(networkClosure(undefined, "unreachable")).toBe("unreachable");
    expect(networkClosure(undefined, "outdated")).toBe("outdated");
  });

  it("closes nothing on a guess or when all is well", () => {
    expect(networkClosure(undefined, "unknown")).toBeUndefined();
    expect(networkClosure({ active: false, secondsRemaining: 0 }, "online")).toBeUndefined();
  });
});
