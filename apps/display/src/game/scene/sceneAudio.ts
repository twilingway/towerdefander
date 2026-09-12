import type { DisplayGameSnapshot } from "@spaceship-defender/protocol";

import { audioBus } from "../../audio/AudioBus.js";
import { asSoundId } from "../../audio/catalogue.js";
import { createBurstTracker } from "../../audio/burst.js";
import type { SoundChannel } from "../../audio/mixer.js";

/**
 * Where the scene sends what it wants heard.
 *
 * An interface rather than the bus itself, for the same reason the bursts are
 * one: the scene names an event and a place, and whether that becomes a sound -
 * and how loud - is somebody else's arithmetic. A scene handed nothing is a
 * scene that plays nothing, which is what the preview and the tests get.
 */
export interface SceneAudio {
  play: (id: string | undefined, x: number, y: number, channel?: SoundChannel) => void;
  /**
   * A shot from a repeating weapon. Separate from `play` because a burst sample
   * must not be started on every round, and because a weapon's rate of fire is
   * something the sample has to be kept in step with; see `burst.ts`.
   */
  weapon: (id: string | undefined, x: number, y: number, channel?: SoundChannel) => void;
  /** Once a frame: stops a burst whose trigger has been let go. */
  settle: (nowMs: number) => void;
}

/** The listener is the camera: what is framed is what is heard at full volume. */
export function sceneAudioFor(read: () => DisplayGameSnapshot): SceneAudio {
  const bursts = createBurstTracker();
  const placement = (x: number, y: number, channel: SoundChannel) => {
    const snapshot = read();
    return {
      x,
      y,
      listenerX: snapshot.spaceship.x,
      listenerY: snapshot.spaceship.y,
      frameWidth: snapshot.cameraViewWidth,
      channel
    };
  };

  return {
    play(id, x, y, channel = "own") {
      const sound = asSoundId(id);
      if (sound === undefined) return;
      audioBus().play(sound, placement(x, y, channel));
    },

    weapon(id, x, y, channel = "own") {
      const sound = asSoundId(id);
      if (sound === undefined) return;
      const start = bursts.shot(sound, performance.now());
      if (start === null) return;
      audioBus().play(sound, placement(x, y, channel), start.rate);
    },

    settle(nowMs) {
      for (const id of bursts.settle(nowMs)) {
        const sound = asSoundId(id);
        if (sound !== undefined) audioBus().stop(sound);
      }
    }
  };
}

/**
 * What a wreck of this kind is heard as when the preset names nothing.
 *
 * The same shape as `deathEffectFor` beside it, and for the same reason: a boss
 * going up is the one death on the field that has to sound different from the
 * fifteen before it, and a preset that has never been opened should still get
 * that for free. An asteroid breaking up is not an explosion and gets nothing.
 */
export function deathSoundFor(
  visualKind: string,
  isBoss: boolean,
  chosen: string | undefined
): string | undefined {
  if (chosen !== undefined && chosen !== "") return chosen;
  if (visualKind !== "enemy") return undefined;
  return isBoss ? "boss-explosion" : "explosion";
}
