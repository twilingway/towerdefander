import { SOUND_FILES } from "@spaceship-defender/audio-assets";
import { MUSIC_FILES, type MusicSource } from "@spaceship-defender/audio-assets/music";
import { SOUND_IDS } from "@spaceship-defender/protocol";
import type { MusicTrackId, SoundId } from "@spaceship-defender/protocol";

/**
 * The catalogue's ids joined to the files they name.
 *
 * The protocol carries the ids because the server validates presets against
 * them; the bytes live in `@spaceship-defender/audio-assets`, which the balance
 * console imports too - an operator auditions a sound from the same file the
 * game will play. The test beside this is what keeps the two lists from
 * drifting apart.
 */
export function soundUrl(id: SoundId): string | undefined {
  return SOUND_FILES[id];
}

export function musicSources(id: MusicTrackId): readonly MusicSource[] {
  return MUSIC_FILES[id] ?? [];
}

/** A string off the wire is a sound only if the catalogue says so. */
export function asSoundId(value: string | undefined): SoundId | undefined {
  if (value === undefined || value === "") return undefined;
  return SOUND_IDS.find((id) => id === value);
}
