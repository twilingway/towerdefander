import { UPGRADE_CATALOGUE } from "@spaceship-defender/game-core";
import {
  GUNNER_UPGRADE_IDS,
  PILOT_UPGRADE_IDS,
  SHIELD_UPGRADE_IDS,
  UPGRADE_IDS
} from "@spaceship-defender/protocol";
import { describe, expect, it } from "vitest";

/**
 * The catalogue lives in game-core and the wire enum in protocol; neither package
 * depends on the other, so the server - which sees both - is where they are kept
 * in step. A new upgrade that reaches only one side fails here.
 */
describe("upgrade catalogue and protocol enum", () => {
  it("offers exactly the ids the protocol accepts", () => {
    expect(Object.keys(UPGRADE_CATALOGUE).sort()).toEqual([...UPGRADE_IDS].sort());
  });

  it("assigns each id to the role its protocol pool names", () => {
    const byRole = {
      pilot: PILOT_UPGRADE_IDS,
      gunner: GUNNER_UPGRADE_IDS,
      shield: SHIELD_UPGRADE_IDS
    };
    for (const [role, ids] of Object.entries(byRole)) {
      for (const id of ids) {
        expect(UPGRADE_CATALOGUE[id].role, id).toBe(role);
      }
    }
  });
});
