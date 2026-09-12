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

/**
 * What is actually inside each sample, measured rather than assumed.
 *
 * Two of these files are bursts, not shots: the machine gun is eight rounds
 * eighty milliseconds apart, and playing the whole thing on every trigger pull
 * is the mush it sounds like. So a sample says how many shots it contains and
 * how fast, and the display plays it once per that many shots, stretched to the
 * weapon's own rate of fire - which is what keeps it in step when that rate
 * becomes something a crew upgrades.
 *
 * Measured off the decoded waveform: 5 ms RMS windows, an onset counted where
 * the envelope crosses a quarter of the peak having been below a tenth. The
 * same pass found up to two seconds of pure silence on the end of every file,
 * which is why they are shorter now than the originals.
 */
export interface SoundShape {
  /** Rounds in the recording; one means it is a single event, not a burst. */
  readonly shots: number;
  /** Milliseconds between them, as recorded. Meaningless when `shots` is one. */
  readonly shotGapMs: number;
}

export const SOUND_SHAPES: Readonly<Record<string, SoundShape>> = {
  cannon: { shots: 1, shotGapMs: 0 },
  // One round, cut from the last of the recorded burst so it carries its own
  // decay: a gun that fires faster is then simply heard firing faster, with no
  // sample stretched and no pitch drifting up as its rate of fire is upgraded.
  "machine-gun": { shots: 1, shotGapMs: 0 },
  "machine-gun-alt": { shots: 8, shotGapMs: 100 },
  explosion: { shots: 1, shotGapMs: 0 },
  "boss-explosion": { shots: 1, shotGapMs: 0 }
};
