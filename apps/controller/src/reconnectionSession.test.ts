import { describe, expect, it } from "vitest";

import {
  LEGACY_RECONNECTION_SESSION_KEY,
  RECONNECTION_SESSION_KEY,
  clearReconnectionSession,
  leaveControllerRoom,
  readReconnectionSession,
  saveReconnectionSession,
  type SessionStorage
} from "./reconnectionSession.js";

function createStorage(): SessionStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    }
  };
}

describe("controller reconnection session", () => {
  it("round-trips the server reconnection token", () => {
    const storage = createStorage();
    const session = {
      endpoint: "ws://192.168.1.20:2567",
      roomId: "ROOM1",
      playerName: "Alex",
      token: "ROOM1:token"
    };

    saveReconnectionSession(storage, session);
    expect(readReconnectionSession(storage)).toEqual(session);

    clearReconnectionSession(storage);
    expect(readReconnectionSession(storage)).toBeUndefined();
  });

  it("rejects malformed stored data", () => {
    const storage = createStorage();
    storage.setItem(RECONNECTION_SESSION_KEY, '{"token":42}');

    expect(readReconnectionSession(storage)).toBeUndefined();
  });

  it("deletes the legacy v9 session before reading reconnect data", () => {
    const storage = createStorage();
    const currentSession = {
      endpoint: "ws://localhost:2567",
      roomId: "SPACE1",
      playerName: "Alex",
      token: "SPACE1:token"
    };
    storage.setItem(LEGACY_RECONNECTION_SESSION_KEY, '{"token":"stale"}');
    storage.setItem(RECONNECTION_SESSION_KEY, JSON.stringify(currentSession));

    expect(readReconnectionSession(storage)).toEqual(currentSession);
    expect(storage.getItem(LEGACY_RECONNECTION_SESSION_KEY)).toBeNull();
  });

  it("does not reuse a legacy v9 session", () => {
    const storage = createStorage();
    storage.setItem(
      LEGACY_RECONNECTION_SESSION_KEY,
      JSON.stringify({
        endpoint: "ws://localhost:2567",
        roomId: "OLD1",
        playerName: "Alex",
        token: "OLD1:token"
      })
    );

    expect(readReconnectionSession(storage)).toBeUndefined();
    expect(storage.getItem(LEGACY_RECONNECTION_SESSION_KEY)).toBeNull();
  });

  it("disables reconnect, clears storage and performs consented leave", async () => {
    const storage = createStorage();
    saveReconnectionSession(storage, {
      endpoint: "ws://localhost:2567",
      roomId: "ROOM1",
      playerName: "Alex",
      token: "ROOM1:token"
    });
    const calls: boolean[] = [];
    const room = {
      reconnection: { enabled: true },
      leave: (consented = false) => {
        calls.push(consented);
        return Promise.resolve();
      }
    };

    await leaveControllerRoom(room, storage);

    expect(room.reconnection.enabled).toBe(false);
    expect(calls).toEqual([true]);
    expect(readReconnectionSession(storage)).toBeUndefined();
  });
});
