import { describe, expect, it, vi } from "vitest";

import {
  CLOSE_ROOM_CONFIRMATION,
  closeDisplayRoom,
  confirmDisplayRoomClose,
  roomClosingMessage
} from "./displayRoomLifecycle.js";

describe("display room lifecycle", () => {
  it("requires confirmation before closing the room", () => {
    const confirm = vi.fn(() => false);

    expect(confirmDisplayRoomClose(confirm)).toBe(false);
    expect(confirm).toHaveBeenCalledWith(CLOSE_ROOM_CONFIRMATION);
  });

  it("disables reconnect before sending a consented leave", async () => {
    const calls: string[] = [];
    const room = {
      reconnection: {
        get enabled() {
          return true;
        },
        set enabled(value: boolean) {
          calls.push(`reconnect:${String(value)}`);
        }
      },
      leave: vi.fn((consented: boolean) => {
        calls.push(`leave:${String(consented)}`);
        return Promise.resolve(1000);
      })
    };

    await closeDisplayRoom(room);

    expect(calls).toEqual(["reconnect:false", "leave:true"]);
  });

  it("maps every typed server closing reason to stable user-facing copy", () => {
    expect(roomClosingMessage("display_left")).toContain("общим экраном");
    expect(roomClosingMessage("display_reconnect_expired")).toContain("переподключиться");
    expect(roomClosingMessage("lobby_expired")).toContain("экипаж");
    expect(roomClosingMessage("result_expired")).toContain("повторный забег");
    expect(roomClosingMessage("controllers_expired")).toContain("игроки");
    expect(roomClosingMessage("room_lifetime_expired")).toContain("максимального времени");
  });
});
