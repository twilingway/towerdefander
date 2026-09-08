import { describe, expect, it } from "vitest";

import { readLiveGame, readLiveView, setLiveView } from "./liveView.js";

describe("liveView", () => {
  it("hands back what was last published, and nothing once it is cleared", () => {
    expect(readLiveView()).toBeUndefined();
    expect(readLiveGame()).toBeUndefined();

    const view = { roomId: "ABCDE", game: { serverStepMs: 8 } } as never;
    setLiveView(view);
    expect(readLiveView()).toBe(view);
    expect(readLiveGame()).toEqual({ serverStepMs: 8 });

    setLiveView(undefined);
    expect(readLiveView()).toBeUndefined();
    expect(readLiveGame()).toBeUndefined();
  });

  it("reads a lobby view as having no game", () => {
    setLiveView({ roomId: "ABCDE", game: null } as never);
    expect(readLiveGame()).toBeUndefined();
    setLiveView(undefined);
  });
});
