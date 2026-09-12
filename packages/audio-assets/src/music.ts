/**
 * The themes, which the display plays and nothing else imports.
 *
 * Its own entry point for that reason: see the note in `index.ts`.
 */

/**
 * Themes in two formats, best first.
 *
 * Opus at the quality of a 128 kbps mp3 is half the bytes, and unlike mp3 it
 * loops without the encoder's padding clicking every time round - which for the
 * one sound that plays continuously is the bigger of the two arguments. The mp3
 * is the fallback for a browser that will not take Ogg; the element picks one
 * and downloads only that one.
 */
export interface MusicSource {
  readonly src: string;
  readonly type: string;
}

export const MUSIC_FILES: Readonly<Record<string, readonly MusicSource[]>> = {
  "theme-01": [
    { src: new URL("../music/theme-01.ogg", import.meta.url).href, type: "audio/ogg; codecs=opus" },
    { src: new URL("../music/theme-01.mp3", import.meta.url).href, type: "audio/mpeg" }
  ],
  "theme-17": [
    { src: new URL("../music/theme-17.ogg", import.meta.url).href, type: "audio/ogg; codecs=opus" },
    { src: new URL("../music/theme-17.mp3", import.meta.url).href, type: "audio/mpeg" }
  ]
};
