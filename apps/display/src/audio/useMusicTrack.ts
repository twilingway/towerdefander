import { useEffect } from "react";
import type { MusicTrackId } from "@spaceship-defender/protocol";

import { audioBus } from "./AudioBus.js";

/**
 * The theme this screen is played under, or null for silence.
 *
 * Asking for the track that is already playing does nothing, and leaving a
 * screen stops nothing: the next screen names its own theme and the switch
 * happens there. That is what keeps a route change from punching a hole of
 * silence between two screens that both wanted the same music - and what makes
 * a screen that wants silence say so, rather than get it by accident.
 */
export function useMusicTrack(track: MusicTrackId | null): void {
  useEffect(() => {
    audioBus().playMusic(track ?? undefined);
  }, [track]);
}
