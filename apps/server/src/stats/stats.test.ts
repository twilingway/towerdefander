import type { Request, RequestHandler, Response } from "express";
import { describe, expect, it, vi } from "vitest";

import { isLoopbackAddress, isStatsRequestAuthorized } from "./access.js";
import { ROOM_STATS_HTML } from "./html.js";
import { createRoomsHtmlHandler, createRoomsJsonHandler } from "./routes.js";
import { createRoomStatsSnapshot } from "./snapshot.js";
import type { RoomStatsListing, RoomStatsMetadata } from "./types.js";

function basicAuthorization(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
}

function request(
  remoteAddress: string | undefined,
  authorization?: string,
  forwardedFor?: string
): Request {
  return {
    headers: {
      authorization,
      "x-forwarded-for": forwardedFor
    },
    socket: { remoteAddress }
  } as unknown as Request;
}

interface ResponseState {
  status: number;
  headers: Record<string, string>;
  contentType: string | undefined;
  body: unknown;
}

function response(): { response: Response; state: ResponseState } {
  const state: ResponseState = {
    status: 200,
    headers: {},
    contentType: undefined,
    body: undefined
  };
  const fakeResponse = {
    setHeader(name: string, value: string) {
      state.headers[name.toLowerCase()] = value;
      return this;
    },
    status(status: number) {
      state.status = status;
      return this;
    },
    type(contentType: string) {
      state.contentType = contentType;
      return this;
    },
    send(body: unknown) {
      state.body = body;
      return this;
    },
    json(body: unknown) {
      state.body = body;
      return this;
    }
  } as unknown as Response;

  return { response: fakeResponse, state };
}

async function invoke(handler: RequestHandler, input: Request, output: Response): Promise<void> {
  await handler(input, output, vi.fn());
}

function metadata(overrides: Partial<RoomStatsMetadata> = {}): RoomStatsMetadata {
  return {
    statsId: "stats-only-1",
    status: "combat",
    connectedPlayers: 3,
    reservedPlayers: 0,
    capacity: 3,
    displayConnected: true,
    createdAtMs: 1_000,
    statusChangedAtMs: 2_000,
    expiresAtMs: 21_000,
    ...overrides
  };
}

describe("statistics access", () => {
  it.each(["127.0.0.1", "127.255.1.9", "::1", "::ffff:127.0.0.1"])(
    "recognizes loopback address %s",
    (address) => {
      expect(isLoopbackAddress(address)).toBe(true);
    }
  );

  it.each([undefined, "192.168.1.10", "::ffff:192.168.1.10", "::2", "127.0.0.999"])(
    "rejects non-loopback address %s",
    (address) => {
      expect(isLoopbackAddress(address)).toBe(false);
    }
  );

  it("ignores forwarding headers when password is absent", () => {
    expect(
      isStatsRequestAuthorized(request("192.168.1.10", undefined, "127.0.0.1"), undefined)
    ).toBe(false);
  });

  it("requires the fixed admin username and exact password even on loopback", () => {
    expect(
      isStatsRequestAuthorized(
        request("127.0.0.1", basicAuthorization("admin", "secret")),
        "secret"
      )
    ).toBe(true);
    expect(
      isStatsRequestAuthorized(
        request("127.0.0.1", basicAuthorization("operator", "secret")),
        "secret"
      )
    ).toBe(false);
    expect(
      isStatsRequestAuthorized(request("127.0.0.1", basicAuthorization("admin", "wrong")), "secret")
    ).toBe(false);
  });
});

describe("room statistics snapshot", () => {
  it("aggregates anonymous room rows from valid metadata", () => {
    const snapshot = createRoomStatsSnapshot(
      [
        { metadata: metadata() },
        {
          metadata: metadata({
            statsId: "stats-only-2",
            status: "result",
            connectedPlayers: 1,
            reservedPlayers: 1,
            displayConnected: false,
            createdAtMs: 5_000,
            expiresAtMs: null
          })
        }
      ],
      11_000
    );

    expect(snapshot).toMatchObject({
      generatedAt: "1970-01-01T00:00:11.000Z",
      totals: {
        rooms: 2,
        connectedPlayers: 4,
        reservedPlayers: 1,
        connectedDisplays: 1,
        byStatus: { combat: 1, result: 1 }
      },
      rooms: [
        { status: "combat", ageSeconds: 10, expiresInSeconds: 10 },
        { status: "result", ageSeconds: 6, expiresInSeconds: null }
      ]
    });
  });

  it("drops invalid metadata and never serializes listing or metadata secrets", () => {
    const secretValues = [
      "join-room-id",
      "player-name",
      "session-token",
      "10.1.2.3",
      "reconnect-token",
      "private-seed",
      "entity-secret"
    ];
    const listing = {
      roomId: secretValues[0],
      name: secretValues[1],
      sessionId: secretValues[2],
      ip: secretValues[3],
      reconnectToken: secretValues[4],
      metadata: {
        ...metadata(),
        seed: secretValues[5],
        entities: secretValues[6]
      }
    } as RoomStatsListing;
    const serialized = JSON.stringify(createRoomStatsSnapshot([listing], 11_000));

    for (const secret of secretValues) {
      expect(serialized).not.toContain(secret);
    }
    expect(createRoomStatsSnapshot([{ metadata: { status: "combat" } }], 11_000).totals.rooms).toBe(
      0
    );
  });
});

describe("statistics routes", () => {
  it("returns no-store JSON to a loopback request", async () => {
    const output = response();
    await invoke(
      createRoomsJsonHandler({
        password: undefined,
        queryRooms: () => Promise.resolve([{ metadata: metadata() }]),
        now: () => 11_000
      }),
      request("::1"),
      output.response
    );

    expect(output.state.status).toBe(200);
    expect(output.state.headers["cache-control"]).toBe("no-store");
    expect(output.state.body).toMatchObject({ totals: { rooms: 1, connectedPlayers: 3 } });
  });

  it("returns 401 without room data to an unauthorized request", async () => {
    const queryRooms = vi.fn(() => Promise.resolve([{ metadata: metadata() }]));
    const output = response();
    await invoke(
      createRoomsJsonHandler({ password: undefined, queryRooms }),
      request("192.168.1.10", undefined, "127.0.0.1"),
      output.response
    );

    expect(output.state).toMatchObject({ status: 401, body: "Unauthorized" });
    expect(output.state.headers["www-authenticate"]).toContain("Basic");
    expect(queryRooms).not.toHaveBeenCalled();
  });

  it("isolates query failures behind a generic 503 response", async () => {
    const output = response();
    await invoke(
      createRoomsJsonHandler({
        password: undefined,
        queryRooms: () => Promise.reject(new Error("driver secret stack"))
      }),
      request("127.0.0.1"),
      output.response
    );

    expect(output.state).toMatchObject({
      status: 503,
      body: "Statistics temporarily unavailable"
    });
    expect(String(output.state.body)).not.toContain("driver secret stack");
  });

  it("serves a fixed HTML page with safe rendering and five-second polling", async () => {
    const output = response();
    await invoke(
      createRoomsHtmlHandler({ password: "secret", queryRooms: () => Promise.resolve([]) }),
      request("192.168.1.10", basicAuthorization("admin", "secret")),
      output.response
    );

    expect(output.state.status).toBe(200);
    expect(output.state.contentType).toBe("html");
    expect(output.state.headers["cache-control"]).toBe("no-store");
    expect(output.state.headers["content-security-policy"]).toContain("connect-src 'self'");
    expect(output.state.body).toBe(ROOM_STATS_HTML);
    expect(ROOM_STATS_HTML).toContain("setInterval(refresh, 5000)");
    expect(ROOM_STATS_HTML).toContain("textContent");
    expect(ROOM_STATS_HTML).not.toContain("WebSocket");
  });
});
