// Key art in, tiles out.
//
// The start screen wants two 16:9 images at `apps/display/public/art/`, and what
// comes out of an image generator is rarely that size and never that weight.
// This crops to 16:9 about the centre, scales to 1920x1080, writes a 960x540
// beside it for phones, and keeps both under a couple of hundred kilobytes -
// which matters on a television that loads the page over Wi-Fi.
//
// Usage:
//   node scripts/prepare-key-art.mjs <campaign-image> <arena-image>
//   node scripts/prepare-key-art.mjs --campaign <file>
//   node scripts/prepare-key-art.mjs --arena <file>
//
// Needs ffmpeg on PATH, which is also what bakes the effect atlases.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, "../apps/display/public/art");

const SIZES = [
  { suffix: "", width: 1920, height: 1080, quality: 4 },
  { suffix: "@sm", width: 960, height: 540, quality: 5 }
];

function parseArguments(argv) {
  const jobs = [];
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--campaign" || value === "--arena") {
      const file = argv[index + 1];
      if (file === undefined) throw new Error(`${value} needs a file after it.`);
      jobs.push({ name: value.slice(2), source: file });
      index += 1;
      continue;
    }
    positional.push(value);
  }
  if (positional.length === 2) {
    jobs.push({ name: "campaign", source: positional[0] });
    jobs.push({ name: "arena", source: positional[1] });
  } else if (positional.length === 1 && jobs.length === 0) {
    throw new Error("Give both images, or name one with --campaign / --arena.");
  }
  if (jobs.length === 0) {
    throw new Error(
      "Usage: node scripts/prepare-key-art.mjs <campaign-image> <arena-image>\n" +
        "   or: node scripts/prepare-key-art.mjs --campaign <file> [--arena <file>]"
    );
  }
  return jobs;
}

function convert(source, target, { width, height, quality }) {
  const filter = [
    `scale=${String(width)}:${String(height)}:force_original_aspect_ratio=increase`,
    `crop=${String(width)}:${String(height)}`
  ].join(",");
  const result = spawnSync(
    "ffmpeg",
    ["-y", "-loglevel", "error", "-i", source, "-vf", filter, "-q:v", String(quality), target],
    { stdio: "inherit" }
  );
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) throw new Error(`ffmpeg failed on ${source}`);
}

const jobs = parseArguments(process.argv.slice(2));
mkdirSync(outDir, { recursive: true });

for (const job of jobs) {
  const source = resolve(process.cwd(), job.source);
  if (!existsSync(source)) throw new Error(`No such file: ${source}`);
  for (const size of SIZES) {
    const target = resolve(outDir, `${job.name}${size.suffix}.jpg`);
    convert(source, target, size);
    console.log(`${job.name}${size.suffix}.jpg — ${String(size.width)}x${String(size.height)}`);
  }
}

console.log(`\nDone. The start screen picks these up from /art/ with no further wiring.`);
