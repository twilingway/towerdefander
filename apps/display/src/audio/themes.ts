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
 * `theme-01` is in the catalogue and ready to be named here; the screens ask
 * for this constant rather than for a track, so choosing one is this line and
 * nothing else. Null also means leaving the fight stops the battle theme,
 * which is what makes the menu quiet rather than the last thing still playing.
 */
export const MENU_THEME: MusicTrackId | null = null;
export const BATTLE_THEME: MusicTrackId = "theme-17";
