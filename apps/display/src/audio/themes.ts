import type { MusicTrackId } from "@spaceship-defender/protocol";

/**
 * Which theme plays where, decided in code rather than in the preset.
 *
 * There are two of them. A setting for choosing between two things the game
 * already knows how to choose is a setting nobody ever moves, and it would have
 * to travel the wire to be one.
 */

/**
 * Nothing, on purpose: the menu is silent until somebody picks its music.
 *
 * The screens ask for this constant rather than for a track, so choosing one is
 * this line and nothing else. Null also means leaving the fight stops the
 * battle music, which is what makes the menu quiet rather than the last thing
 * still playing.
 */
export const MENU_THEME: MusicTrackId | null = null;

/**
 * The fight's music, played in turn: one theme on repeat wore thin over a
 * session. The next fight picks up after the track the last one played.
 */
export const BATTLE_THEMES: readonly MusicTrackId[] = ["theme-17", "theme-01"];
