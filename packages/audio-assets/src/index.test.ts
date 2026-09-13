import { existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { SOUND_FILES } from "./index.ts";
import { MUSIC_FILES } from "./music.ts";

/**
 * The manifest names files; this is what says they are there.
 *
 * Under a bundler these hrefs become emitted assets, and a missing one is a
 * build error. Under node they are plain `file:` urls, which is what lets the
 * check run without a browser.
 */
describe("the audio manifest", () => {
  it("names a file that exists for every sound", () => {
    const missing = Object.entries(SOUND_FILES)
      .filter(([, href]) => !existsSync(fileURLToPath(href)))
      .map(([id]) => id);
    expect(missing).toEqual([]);
  });

  it("names both formats of every theme, and both are there", () => {
    for (const [id, sources] of Object.entries(MUSIC_FILES)) {
      expect([id, sources.map((source) => source.type)]).toEqual([
        id,
        ["audio/ogg; codecs=opus", "audio/mpeg"]
      ]);
      const missing = sources.filter((source) => !existsSync(fileURLToPath(source.src)));
      expect([id, missing]).toEqual([id, []]);
    }
  });

  /**
   * A gunshot is kilobytes. When one arrives in hundreds of them it is almost
   * always cover art left in the file - which is what the first import of these
   * sounds turned out to be carrying: six kilobytes of audio inside a hundred
   * and twenty of picture.
   */
  it("keeps event sounds small enough to be event sounds", () => {
    const heavy = Object.entries(SOUND_FILES)
      .map(([id, href]) => ({
        id,
        kilobytes: Math.round(statSync(fileURLToPath(href)).size / 1024)
      }))
      .filter((file) => file.kilobytes > 80);
    expect(heavy).toEqual([]);
  });
});
