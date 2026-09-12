import { SOUND_FILES } from "@spaceship-defender/audio-assets";

/**
 * Auditioning a sound, from the same file the game will play.
 *
 * One at a time: an operator comparing two gunshots clicks them in a row, and
 * two overlapping is exactly the comparison they were not trying to make. No
 * volume control here either - the console is a tool on somebody's desk, and
 * the volume of the desk is the operating system's business.
 */
let playing: HTMLAudioElement | undefined;

export function playPreview(id: string): void {
  playing?.pause();
  playing = undefined;
  const url = SOUND_FILES[id];
  if (url === undefined) return;
  const audio = new Audio(url);
  playing = audio;
  // Refused before the first gesture of the page; a click is one, so by the
  // time anybody presses this it has long since been given.
  void audio.play().catch(() => undefined);
}
