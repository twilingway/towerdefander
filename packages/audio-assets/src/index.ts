/**
 * The game's audio, as files two apps can reach.
 *
 * Same shape as the baked atlases beside it, and for the same reason: a URL
 * resolved through `new URL(..., import.meta.url)` is what a bundler follows,
 * so the file is emitted once and served from wherever the app that imports it
 * is served. The display plays them; the balance console auditions them before
 * an operator assigns one, and neither needs a second copy on disk.
 *
 * Only files live here. Which ids are legal is the protocol's business
 * (`audioCatalogue.ts`), and the test beside this asserts the two agree.
 *
 * The themes are a second entry point (`./music`) rather than more of this
 * one, because the console never plays them: a bundler emits every asset a
 * module names, so a single entry put four megabytes of music into a build
 * that only wanted five gunshots.
 */

/** Short events: mono, because the display places them in the world itself. */
export const SOUND_FILES: Readonly<Record<string, string>> = {
  cannon: new URL("../sounds/cannon.mp3", import.meta.url).href,
  "machine-gun": new URL("../sounds/machine-gun.mp3", import.meta.url).href,
  "machine-gun-alt": new URL("../sounds/machine-gun-alt.mp3", import.meta.url).href,
  explosion: new URL("../sounds/explosion.mp3", import.meta.url).href,
  "boss-explosion": new URL("../sounds/boss-explosion.mp3", import.meta.url).href
};
