import { CREW_ROLES, controllerRoomViewSchema } from "@spaceship-defender/protocol";
import { describe, expect, it } from "vitest";

import { PREVIEW_PHASES } from "@spaceship-defender/client-shared";
import { createPreviewRoomView } from "./previewMode.js";

describe("createPreviewRoomView", () => {
  it("produces a view the protocol accepts for every role and phase", () => {
    for (const role of CREW_ROLES) {
      for (const phase of PREVIEW_PHASES) {
        const result = controllerRoomViewSchema.safeParse(createPreviewRoomView(role, phase));
        expect(result.error?.issues ?? [], `${role}/${phase}`).toEqual([]);
      }
    }
  });

  it("keeps the lobby projection empty as the protocol requires", () => {
    const view = createPreviewRoomView("pilot", "lobby");

    expect(view.runNumber).toBe(0);
    expect(view.game).toBeNull();
  });

  it("assigns the requested role and keeps that player findable", () => {
    const view = createPreviewRoomView("shield", "combat");

    expect(view.assignedRole).toBe("shield");
    expect(view.players.some((player) => player.role === "shield")).toBe(true);
  });

  it("offers upgrade cards only during the intermission", () => {
    expect(createPreviewRoomView("pilot", "intermission").game?.teamUpgrade.offer).not.toBeNull();
    expect(createPreviewRoomView("pilot", "combat").game?.teamUpgrade.offer).toBeNull();
  });

  it("shows the current player as not ready on the result screen", () => {
    const view = createPreviewRoomView("gunner", "result");

    expect(view.players.find((player) => player.role === "gunner")?.ready).toBe(false);
  });
});
