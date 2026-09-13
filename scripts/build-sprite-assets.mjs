// Builds the raster sprites in packages/sprite-assets/sources into committed WebP
// textures, and regenerates the typed manifest the display and the console read.
//
// ffmpeg does all of it - the same tool `art:prepare` already needs:
//
//   * every cell of a source is cropped to where its art actually is, the
//     opaque box `cropdetect` finds on the alpha plane, and fitted into a 256
//     cell. A sprite then reaches its own radius whatever margin the artist left
//     around it, so a hit circle means the same thing for a small rock as for a
//     big one;
//   * cells are laid left to right and padded to a power of two, because Phaser
//     only mipmaps a texture whose sides are powers of two, and a hull shown at
//     sixty pixels out of 256 needs its mipmaps;
//   * the result is WebP with alpha, a fraction of the PNG it came from.
//
// Usage:
//   node scripts/build-sprite-assets.mjs
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const PACKAGE = resolve(here, "../packages/sprite-assets");
const SOURCES = join(PACKAGE, "sources", "sprites");
const OUTPUT = join(PACKAGE, "sprites");
const MANIFEST = join(PACKAGE, "src", "manifest.ts");

/** Side of one built cell, in texels. The catalogue's sprite radius is half of it. */
const CELL = 256;
/** Alpha below this fraction of full counts as empty margin, not as art. */
const ALPHA_THRESHOLD = 0.06;
const WEBP_QUALITY = 85;

/**
 * How each source is cut. A source not listed here is one cell; a sheet names
 * its cell size and how many cells it holds, in one row from the left.
 */
const SHEETS = {
  "sprite-asteroids": { cells: 3, cellWidth: 256, cellHeight: 256 }
};

function ffmpeg(args) {
  const result = spawnSync("ffmpeg", ["-hide_banner", ...args], { encoding: "utf8" });
  if (result.error !== undefined) {
    throw new Error(`ffmpeg did not start (${result.error.message}); it has to be on PATH.`);
  }
  if (result.status !== 0) {
    throw new Error(`ffmpeg exited with ${String(result.status)}:\n${result.stderr.slice(-2000)}`);
  }
  return result.stderr;
}

/** Width and height straight from the PNG header, so nothing has to decode the pixels. */
function pngSize(path) {
  const header = readFileSync(path).subarray(0, 24);
  if (header.toString("ascii", 12, 16) !== "IHDR") throw new Error(`${path} is not a PNG.`);
  return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
}

function nextPowerOfTwo(value) {
  return 2 ** Math.ceil(Math.log2(value));
}

/** The opaque box of one cell, in that cell's own coordinates. */
function detectArt(source, cell) {
  const report = ffmpeg([
    "-i",
    source,
    "-vf",
    `crop=${String(cell.width)}:${String(cell.height)}:${String(cell.x)}:${String(cell.y)},` +
      `alphaextract,cropdetect=limit=${String(ALPHA_THRESHOLD)}:round=2:skip=0:reset=0`,
    "-f",
    "null",
    "-"
  ]);
  const boxes = [...report.matchAll(/crop=(\d+):(\d+):(\d+):(\d+)/g)];
  const last = boxes.at(-1);
  if (last === undefined) throw new Error(`${source}: cell at x=${String(cell.x)} has no art.`);
  const [width, height, x, y] = last.slice(1).map(Number);
  return { width, height, x, y };
}

async function buildSprite(id) {
  const source = join(SOURCES, `${id}.png`);
  const size = pngSize(source);
  const sheet = SHEETS[id] ?? { cells: 1, cellWidth: size.width, cellHeight: size.height };
  const cells = Array.from({ length: sheet.cells }, (_, index) => ({
    x: index * sheet.cellWidth,
    y: 0,
    width: sheet.cellWidth,
    height: sheet.cellHeight
  }));
  const width = nextPowerOfTwo(cells.length * CELL);

  const labels = cells.map((_, index) => `c${String(index)}`);
  const graph = [
    `[0:v]format=rgba,split=${String(cells.length)}${labels.map((label) => `[s${label}]`).join("")}`,
    ...cells.map((cell, index) => {
      const art = detectArt(source, cell);
      return (
        `[s${labels[index]}]crop=${String(cell.width)}:${String(cell.height)}:${String(cell.x)}:${String(cell.y)},` +
        `crop=${String(art.width)}:${String(art.height)}:${String(art.x)}:${String(art.y)},` +
        `scale=${String(CELL)}:${String(CELL)}:force_original_aspect_ratio=decrease:flags=lanczos,` +
        `pad=${String(CELL)}:${String(CELL)}:(ow-iw)/2:(oh-ih)/2:color=0x00000000[${labels[index]}]`
      );
    }),
    cells.length === 1
      ? `[c0]pad=${String(width)}:${String(CELL)}:0:0:color=0x00000000[out]`
      : `${labels.map((label) => `[${label}]`).join("")}hstack=inputs=${String(cells.length)},` +
        `pad=${String(width)}:${String(CELL)}:0:0:color=0x00000000[out]`
  ].join(";");

  const target = join(OUTPUT, `${id}.webp`);
  const temporary = `${target}.tmp.webp`;
  ffmpeg([
    "-y",
    "-i",
    source,
    "-filter_complex",
    graph,
    "-map",
    "[out]",
    "-frames:v",
    "1",
    "-c:v",
    "libwebp",
    "-quality",
    String(WEBP_QUALITY),
    "-lossless",
    "0",
    "-map_metadata",
    "-1",
    temporary
  ]);
  await rename(temporary, target);
  const { size: bytes } = await stat(target);
  return {
    id,
    bytes,
    width,
    height: CELL,
    frameWidth: CELL,
    frameHeight: CELL,
    frames: cells.length
  };
}

const BACKDROP_SOURCES = join(PACKAGE, "sources", "backdrops");
const BACKDROP_OUTPUT = join(PACKAGE, "backdrops");

/**
 * A sky picture stays one image at its own size. It is drawn about screen size,
 * so it needs neither cells nor power-of-two sides, and leaving it NPOT keeps
 * Phaser from mipmapping it.
 */
async function buildBackdrop(id) {
  const source = join(BACKDROP_SOURCES, `${id}.png`);
  const size = pngSize(source);
  const target = join(BACKDROP_OUTPUT, `${id}.webp`);
  const temporary = `${target}.tmp.webp`;
  ffmpeg([
    "-y",
    "-i",
    source,
    "-frames:v",
    "1",
    "-c:v",
    "libwebp",
    "-quality",
    String(WEBP_QUALITY),
    "-map_metadata",
    "-1",
    temporary
  ]);
  await rename(temporary, target);
  const { size: bytes } = await stat(target);
  return { id, bytes, width: size.width, height: size.height };
}

function renderBackdrops(backdrops) {
  const entry = (art) =>
    [
      "  {",
      `    id: ${JSON.stringify(art.id)},`,
      `    bytes: ${String(art.bytes)},`,
      `    url: new URL("../backdrops/${art.id}.webp", import.meta.url).href,`,
      `    width: ${String(art.width)},`,
      `    height: ${String(art.height)}`,
      "  }"
    ].join("\n");
  return [
    "export const BACKDROP_ARTS: readonly BackdropArt[] = [",
    backdrops.map(entry).join(",\n"),
    "];",
    ""
  ].join("\n");
}

function renderManifest(built, backdrops) {
  const entry = (art) =>
    [
      "  {",
      `    id: ${JSON.stringify(art.id)},`,
      `    bytes: ${String(art.bytes)},`,
      // A literal is required: this is the form Vite rewrites into a hashed asset
      // URL in whichever app imports the manifest.
      `    url: new URL("../sprites/${art.id}.webp", import.meta.url).href,`,
      `    width: ${String(art.width)},`,
      `    height: ${String(art.height)},`,
      `    frameWidth: ${String(art.frameWidth)},`,
      `    frameHeight: ${String(art.frameHeight)},`,
      `    frames: ${String(art.frames)}`,
      "  }"
    ].join("\n");
  return [
    "// Generated by `pnpm sprites:build`. Do not edit by hand - change the source in",
    "// `sources/` or its row in `scripts/build-sprite-assets.mjs`, and rebuild.",
    'import type { BackdropArt, SpriteArt } from "./types.ts";',
    "",
    "export const SPRITE_ARTS: readonly SpriteArt[] = [",
    built.map(entry).join(",\n"),
    "];",
    "",
    renderBackdrops(backdrops)
  ].join("\n");
}

async function writeIfChanged(path, contents) {
  const current = await readFile(path, "utf8").catch(() => undefined);
  if (current === contents) return false;
  await writeFile(`${path}.tmp`, contents);
  await rename(`${path}.tmp`, path);
  return true;
}

const ids = readdirSync(SOURCES)
  .filter((entry) => entry.endsWith(".png"))
  .map((entry) => basename(entry, ".png"))
  .sort();
for (const id of Object.keys(SHEETS)) {
  if (!ids.includes(id)) throw new Error(`SHEETS names ${id}, which has no source.`);
}
if (ids.length === 0) throw new Error(`No sources in ${SOURCES}.`);

await mkdir(OUTPUT, { recursive: true });
const built = [];
for (const id of ids) {
  const art = await buildSprite(id);
  built.push(art);
  console.log(
    `${id}: ${String(art.frames)} frame(s), ${String(art.width)}x${String(art.height)}, ` +
      `${String(Math.round(art.bytes / 102.4) / 10)} KiB`
  );
}
await mkdir(BACKDROP_OUTPUT, { recursive: true });
const backdropIds = readdirSync(BACKDROP_SOURCES)
  .filter((entry) => entry.endsWith(".png"))
  .map((entry) => basename(entry, ".png"))
  .sort();
const backdrops = [];
for (const id of backdropIds) {
  const art = await buildBackdrop(id);
  backdrops.push(art);
  console.log(
    `${id}: backdrop ${String(art.width)}x${String(art.height)}, ` +
      `${String(Math.round(art.bytes / 102.4) / 10)} KiB`
  );
}
const changed = await writeIfChanged(MANIFEST, renderManifest(built, backdrops));
console.log(changed ? "manifest rewritten" : "manifest unchanged");
