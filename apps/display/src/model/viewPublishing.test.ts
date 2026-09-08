import type { DisplayRoomView } from "@spaceship-defender/protocol";
import { describe, expect, it } from "vitest";

import { createPreviewRoomView } from "./previewMode.js";
import { hasImmediateChange } from "./viewPublishing.js";

function combat(): DisplayRoomView {
  return createPreviewRoomView("combat");
}

/** A patch that moved the world and nothing else - the common case, twenty a second. */
function moved(view: DisplayRoomView): DisplayRoomView {
  if (view.game === null) throw new Error("fixture lost its game");
  return {
    ...view,
    game: {
      ...view.game,
      tick: view.game.tick + 1,
      spaceship: { ...view.game.spaceship, x: view.game.spaceship.x + 12 },
      credits: view.game.credits + 3
    }
  };
}

describe("hasImmediateChange", () => {
  it("holds a patch that only moved the world", () => {
    const view = combat();

    expect(hasImmediateChange(view, moved(view))).toBe(false);
  });

  it("publishes the first view there is", () => {
    expect(hasImmediateChange(undefined, combat())).toBe(true);
  });

  it("publishes the moment the fight ends", () => {
    const view = combat();
    if (view.game === null) throw new Error("fixture lost its game");
    const lost = {
      ...view,
      game: { ...view.game, encounter: { ...view.game.encounter, phase: "result" as const } }
    };

    expect(hasImmediateChange(view, lost)).toBe(true);
  });

  it("publishes a vote as soon as it is cast", () => {
    const view = combat();
    if (view.game === null) throw new Error("fixture lost its game");
    const voted = {
      ...view,
      game: {
        ...view.game,
        teamUpgrade: {
          ...view.game.teamUpgrade,
          votes: {
            ...view.game.teamUpgrade.votes,
            pilot: { upgradeId: "hull-plating" as const, role: "pilot" as const, revision: 1 }
          }
        }
      }
    };

    expect(hasImmediateChange(view, voted)).toBe(true);
  });

  it("publishes a crew member going ready, and one dropping out", () => {
    const view = combat();
    const [first, ...rest] = view.players;
    if (first === undefined) throw new Error("fixture lost its roster");

    expect(
      hasImmediateChange(view, { ...view, players: [{ ...first, ready: !first.ready }, ...rest] })
    ).toBe(true);
    expect(hasImmediateChange(view, { ...view, players: rest })).toBe(true);
  });

  it("publishes the shield changing state, because a thumb is waiting on it", () => {
    const view = combat();
    if (view.game === null) throw new Error("fixture lost its game");
    const raised = { ...view, game: { ...view.game, shieldPhase: "up" as const } };

    expect(hasImmediateChange(view, raised)).toBe(true);
  });

  it("publishes a new offer and a bought module", () => {
    const view = combat();
    if (view.game === null) throw new Error("fixture lost its game");
    const offered = {
      ...view,
      game: {
        ...view.game,
        teamUpgrade: {
          ...view.game.teamUpgrade,
          offer: {
            offerId: "offer-1",
            waveNumber: view.game.encounter.waveNumber,
            tier: 1,
            cards: [
              {
                upgradeId: "hull-plating" as const,
                role: "pilot" as const,
                label: "Броня",
                effects: [],
                price: 5 as const
              }
            ]
          }
        }
      }
    };
    const bought = {
      ...view,
      game: { ...view.game, purchasedModules: [...view.game.purchasedModules, "hull-plating"] }
    };

    expect(hasImmediateChange(view, offered)).toBe(true);
    expect(hasImmediateChange(view, bought)).toBe(true);
  });
});
