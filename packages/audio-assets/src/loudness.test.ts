import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { SOUND_FILES } from "./index.ts";
import { MUSIC_FILES } from "./music.ts";

/** Quieter than this at its loudest is a file with nothing in it. */
const AUDIBLE_PEAK_DB = -20;

/**
 * The peak level ffmpeg measures, or undefined when ffmpeg is not here.
 *
 * `spawnSync` rather than `execFileSync` because `volumedetect` reports on
 * stderr, and the exec form hands back stdout only - which reads as "ffmpeg
 * said nothing", which reads as "ffmpeg is not installed", which is how this
 * guard passed a file it had measured at minus ninety decibels.
 */
function peakDb(path: string): number | undefined {
  const run = spawnSync(
    "ffmpeg",
    ["-hide_banner", "-nostats", "-i", path, "-af", "volumedetect", "-f", "null", "-"],
    { encoding: "utf8" }
  );
  if (run.error !== undefined) return undefined;
  const found = /max_volume:\s*(-?\d+(?:\.\d+)?) dB/.exec(run.stderr);
  return found?.[1] === undefined ? undefined : Number(found[1]);
}

/**
 * That every file actually makes a noise.
 *
 * This exists because one did not. A single machine-gun round was cut out of
 * the recorded burst with `-ss` after `-i`, which puts the fade filter on the
 * source's timeline rather than the cut's - so the fade silenced everything
 * past a quarter second and the round was taken out of the silence that left.
 * The file was the right length, the right size and the right bitrate, and
 * measured -91 dB: every check that existed passed it.
 *
 * Skipped rather than failed where ffmpeg is not installed: this is a guard on
 * the files in the repository, and it is the machine that edits them that has
 * to run it.
 */
describe("the audio files", () => {
  it("are all audible", () => {
    const files = [
      ...Object.entries(SOUND_FILES),
      ...Object.entries(MUSIC_FILES).flatMap(([id, sources]) =>
        sources.map((source, at): [string, string] => [`${id}[${String(at)}]`, source.src])
      )
    ];
    const measured = files.map(([id, href]) => ({ id, peak: peakDb(fileURLToPath(href)) }));
    if (measured.every((file) => file.peak === undefined)) {
      console.warn("ffmpeg is not installed; the loudness guard did not run.");
      return;
    }
    const silent = measured.filter(
      (file) => file.peak !== undefined && file.peak < AUDIBLE_PEAK_DB
    );
    expect(silent).toEqual([]);
  });
});
