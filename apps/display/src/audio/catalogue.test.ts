import { MUSIC_TRACK_IDS, SOUND_IDS } from "@spaceship-defender/protocol";
import { describe, expect, it } from "vitest";

import { asSoundId, musicSources, soundUrl } from "./catalogue.js";

/**
 * The other half of the catalogue check.
 *
 * The protocol refuses a preset that names a sound it does not know; this
 * refuses a catalogue id that no file answers to. Between the two there is no
 * way to ship an id that plays nothing - which is the failure that would
 * otherwise be invisible, because silence looks exactly like a quiet game.
 */
describe("the audio catalogue", () => {
  it("has a file for every sound the protocol lists", () => {
    const missing = SOUND_IDS.filter((id) => soundUrl(id) === undefined);
    expect(missing).toEqual([]);
  });

  it("has both formats of every theme the protocol lists", () => {
    const missing = MUSIC_TRACK_IDS.filter((id) => musicSources(id).length < 2);
    expect(missing).toEqual([]);
  });

  it("takes only ids the catalogue knows", () => {
    expect(asSoundId("cannon")).toBe("cannon");
    expect(asSoundId("")).toBeUndefined();
    expect(asSoundId("a-sound-nobody-baked")).toBeUndefined();
  });
});
