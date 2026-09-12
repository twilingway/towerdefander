import { describe, expect, it } from "vitest";

import {
  busGain,
  channelAllowed,
  createSoundThrottle,
  DEFAULT_AUDIO_SETTINGS,
  distanceGain,
  type AudioSettings
} from "./mixer.js";

const LOUD: AudioSettings = {
  sounds: 0.8,
  music: 0.4,
  soundsMuted: false,
  musicMuted: false,
  enemyShots: true,
  enemyDeaths: true
};

describe("the mixer", () => {
  /**
   * One switch per bus, because the two are asked for separately: "turn the
   * music off" is a different sentence from "quiet, somebody is on the phone".
   * Neither loses the number it silences, which is what un-muting returns to.
   */
  it("silences one bus without touching the other or its number", () => {
    const quiet: AudioSettings = { ...LOUD, soundsMuted: true };
    expect(busGain(quiet, "sounds")).toBe(0);
    expect(busGain(quiet, "music")).toBe(0.4);
    expect(busGain({ ...quiet, soundsMuted: false }, "sounds")).toBe(0.8);

    const noMusic: AudioSettings = { ...LOUD, musicMuted: true };
    expect(busGain(noMusic, "music")).toBe(0);
    expect(busGain(noMusic, "sounds")).toBe(0.8);
  });

  it("starts in the middle of both sliders, audible, with the field audible", () => {
    expect(DEFAULT_AUDIO_SETTINGS).toEqual({
      sounds: 0.5,
      music: 0.5,
      soundsMuted: false,
      musicMuted: false,
      enemyShots: true,
      enemyDeaths: true
    });
  });

  /*
   * Turning off the chatter of fifteen other guns must not also turn off the
   * kills, and neither may touch what this ship is doing - which is the whole
   * reason it is two switches rather than one "enemy sounds".
   */
  it("switches the field's two voices independently of the crew's own", () => {
    const quiet: AudioSettings = { ...LOUD, enemyShots: false };
    expect(channelAllowed(quiet, "enemyShot")).toBe(false);
    expect(channelAllowed(quiet, "enemyDeath")).toBe(true);
    expect(channelAllowed(quiet, "own")).toBe(true);
    const noKills: AudioSettings = { ...LOUD, enemyDeaths: false };
    expect(channelAllowed(noKills, "enemyShot")).toBe(true);
    expect(channelAllowed(noKills, "enemyDeath")).toBe(false);
  });

  it("falls off with distance and goes silent past the reach", () => {
    const frame = 2_500;
    expect(distanceGain(0, frame)).toBe(1);
    // Anything on screen is full volume; the frame is 2500 wide.
    expect(distanceGain(1_200, frame)).toBe(1);
    const near = distanceGain(1_600, frame);
    const far = distanceGain(2_200, frame);
    expect(near).toBeGreaterThan(far);
    expect(far).toBeGreaterThan(0);
    expect(distanceGain(9_000, frame)).toBe(0);
  });

  it("refuses two copies started closer together than the gap", () => {
    const throttle = createSoundThrottle({ minGapMs: 50 });
    expect(throttle.take("cannon", 1_000)).toBe(true);
    expect(throttle.take("cannon", 1_030)).toBe(false);
    expect(throttle.take("cannon", 1_060)).toBe(true);
  });

  /*
   * The rule a faster gun depends on: a shot is never refused for being
   * frequent, only for landing on top of another. A cannon firing every eighty
   * milliseconds is heard eighty milliseconds apart, however long its sample
   * runs - which is what has to hold once rate of fire is something a crew
   * upgrades.
   */
  it("lets a fast weapon keep firing", () => {
    const throttle = createSoundThrottle({ minGapMs: 25 });
    const heard = [0, 80, 160, 240, 320].filter((at) => throttle.take("cannon", at));
    expect(heard).toEqual([0, 80, 160, 240, 320]);
  });

  it("keeps one sound's gap out of another's way", () => {
    const throttle = createSoundThrottle({ minGapMs: 50 });
    expect(throttle.take("cannon", 0)).toBe(true);
    expect(throttle.take("explosion", 1)).toBe(true);
  });
});
