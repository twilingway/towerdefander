/**
 * The sounds and themes a preset may name.
 *
 * Only identity lives here; the files live in `apps/display/public/audio`,
 * which the server never reads. The server is what validates a preset, so the
 * list of legal ids has to be somewhere both sides share - the same split
 * `effectCatalogue.ts` and `visualCatalog.ts` already make.
 *
 * The display holds the other half of the check: its own test asserts every id
 * below has a file on disk, so naming a sound and forgetting to add it fails
 * rather than playing silence nobody notices.
 */

/** Every short event sound, in catalogue order. A literal tuple, so schemas can be `z.enum`. */
export const SOUND_IDS = [
  "cannon",
  "machine-gun",
  "machine-gun-alt",
  "explosion",
  "boss-explosion"
] as const;
export type SoundId = (typeof SOUND_IDS)[number];

/**
 * What kind of thing a sound is, for the console to group them by.
 *
 * The same split the effects catalogue makes and for the same reason: a list of
 * five is a list, a list of forty is a drawer, and the groups are what keeps it
 * a list while it grows.
 */
export const SOUND_CATEGORIES = ["weapon", "explosion"] as const;
export type SoundCategory = (typeof SOUND_CATEGORIES)[number];

export const SOUND_CATEGORY_LABELS: Readonly<Record<SoundCategory, string>> = {
  weapon: "Оружие",
  explosion: "Взрывы"
};

export const SOUND_CATEGORY_OF: Readonly<Record<SoundId, SoundCategory>> = {
  cannon: "weapon",
  "machine-gun": "weapon",
  "machine-gun-alt": "weapon",
  explosion: "explosion",
  "boss-explosion": "explosion"
};

/** What the console calls each one; the id is a file name, this is the label. */
export const SOUND_LABELS: Readonly<Record<SoundId, string>> = {
  cannon: "Пушка",
  "machine-gun": "Пулемёт",
  "machine-gun-alt": "Пулемёт, вариант",
  explosion: "Взрыв",
  "boss-explosion": "Взрыв боса"
};

/**
 * The themes, which are not sounds: one plays at a time, looped, on its own
 * volume bus. Which of them plays where is the display's decision rather than
 * the operator's - there are two, and a setting for choosing between two things
 * the game already knows how to choose is a setting nobody moves.
 */
export const MUSIC_TRACK_IDS = ["theme-01", "theme-17"] as const;
export type MusicTrackId = (typeof MUSIC_TRACK_IDS)[number];

export const MUSIC_LABELS: Readonly<Record<MusicTrackId, string>> = {
  "theme-01": "Тема вне боя",
  "theme-17": "Тема боя"
};
