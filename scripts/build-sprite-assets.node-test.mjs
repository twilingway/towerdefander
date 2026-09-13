// The on-disk half of the sprite catalogue's contract: that what
// `pnpm sprites:build` committed still matches what the manifest claims, and that
// the protocol names exactly the sprites that were built.
//
// Lives outside vitest for the same reason as the effect atlases' check: it reads
// files, and the asset package is browser-side with no Node types.
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

// Imported from source, as the effect check imports its catalogue: Node strips
// the types, and the asset package stays free of a dependency on the protocol.
import { BACKDROP_IMAGES, VISUAL_ASSETS } from "../packages/protocol/src/visualCatalog.ts";

const PACKAGE = fileURLToPath(new URL("../packages/sprite-assets/", import.meta.url));
const SOURCES = join(PACKAGE, "sources", "sprites");
const SPRITES = join(PACKAGE, "sprites");
/** Binary files in a repository; each one is kept small on purpose. */
const MAX_SPRITE_BYTES = 128 * 1024;

const sourceIds = readdirSync(SOURCES)
  .filter((entry) => entry.endsWith(".png"))
  .map((entry) => basename(entry, ".png"))
  .sort();
const manifestText = readFileSync(join(PACKAGE, "src", "manifest.ts"), "utf8");
// Three arrays in one generated file: sprites, the sky pictures, then the HUD frames.
const backdropStart = manifestText.indexOf("export const BACKDROP_ARTS");
const hudStart = manifestText.indexOf("export const HUD_ARTS");
const manifest = backdropStart === -1 ? manifestText : manifestText.slice(0, backdropStart);
const backdropManifest =
  backdropStart === -1
    ? ""
    : manifestText.slice(backdropStart, hudStart === -1 ? undefined : hudStart);
const hudManifest = hudStart === -1 ? "" : manifestText.slice(hudStart);

/** The generated manifest is TypeScript, so read the fields out of its text. */
const manifestEntries = [...manifest.matchAll(/^ {4}id: "([^"]+)",$/gm)].map((match) => {
  const block = manifest.slice(match.index, manifest.indexOf("\n  }", match.index));
  const field = (name) => {
    const found = new RegExp(`${name}: (\\d+)`).exec(block);
    return found === null ? undefined : Number(found[1]);
  };
  return {
    id: match[1],
    bytes: field("bytes"),
    width: field("width"),
    height: field("height"),
    frameWidth: field("frameWidth"),
    frameHeight: field("frameHeight"),
    frames: field("frames")
  };
});

/** Canvas size from the WebP container, whichever of its three encodings wrote it. */
function webpSize(buffer) {
  assert.equal(buffer.toString("ascii", 0, 4), "RIFF", "not a RIFF container");
  assert.equal(buffer.toString("ascii", 8, 12), "WEBP", "not a WebP file");
  const chunk = buffer.toString("ascii", 12, 16);
  if (chunk === "VP8X") {
    return { width: 1 + buffer.readUIntLE(24, 3), height: 1 + buffer.readUIntLE(27, 3) };
  }
  if (chunk === "VP8L") {
    const bits = buffer.readUInt32LE(21);
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >>> 14) & 0x3fff) };
  }
  if (chunk === "VP8 ") {
    return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
  }
  throw new Error(`unknown WebP chunk ${chunk}`);
}

const isPowerOfTwo = (value) => value > 0 && (value & (value - 1)) === 0;

test("the manifest covers exactly the sprite sources", () => {
  assert.ok(sourceIds.length > 0, "no sprite sources found");
  assert.deepEqual(
    manifestEntries.map((entry) => entry.id).sort(),
    sourceIds,
    "run `pnpm sprites:build` - the manifest and the sources have drifted apart"
  );
});

test("each manifest entry matches the file it points at", () => {
  for (const entry of manifestEntries) {
    const path = join(SPRITES, `${entry.id}.webp`);
    const stats = statSync(path);
    // A hand-edited manifest, or a texture committed without a rebuild, shows up
    // here and nowhere else: the app would just cut the wrong cells.
    assert.equal(stats.size, entry.bytes, `${entry.id}.webp is ${String(stats.size)} bytes`);
    assert.ok(
      stats.size <= MAX_SPRITE_BYTES,
      `${entry.id}.webp is ${String(Math.round(stats.size / 1024))} KiB, over the ceiling`
    );
    const size = webpSize(readFileSync(path));
    assert.equal(size.width, entry.width, `${entry.id}: width differs from the file`);
    assert.equal(size.height, entry.height, `${entry.id}: height differs from the file`);
    assert.ok(isPowerOfTwo(size.width) && isPowerOfTwo(size.height), `${entry.id}: not POT`);
    const cells = (entry.width / entry.frameWidth) * (entry.height / entry.frameHeight);
    assert.ok(entry.frames <= cells, `${entry.id}: ${String(entry.frames)} frames will not fit`);
  }
});

test("the protocol names exactly the sprites that were built, with their frames", () => {
  // The server validates a preset against the protocol's ids and never sees a
  // picture. A sprite built but not named could never be chosen; one named but
  // not built would let a preset ask for a texture that does not exist.
  const named = VISUAL_ASSETS.filter((asset) => asset.kind === "sprite");
  assert.deepEqual(named.map((asset) => asset.id).sort(), sourceIds);
  for (const asset of named) {
    const entry = manifestEntries.find((candidate) => candidate.id === asset.id);
    assert.equal(entry?.frames, asset.sprite.frames, `${asset.id}: frame counts differ`);
  }
});

const BACKDROPS = join(PACKAGE, "backdrops");
const BACKDROP_SOURCES = join(PACKAGE, "sources", "backdrops");
/** A sky picture is drawn about screen size, so it may weigh more than a sprite - not much more. */
const MAX_BACKDROP_BYTES = 384 * 1024;

const backdropSourceIds = readdirSync(BACKDROP_SOURCES)
  .filter((entry) => entry.endsWith(".png"))
  .map((entry) => basename(entry, ".png"))
  .sort();
const backdropEntries = [...backdropManifest.matchAll(/^ {4}id: "([^"]+)",$/gm)].map((match) => {
  const block = backdropManifest.slice(match.index, backdropManifest.indexOf("\n  }", match.index));
  const field = (name) => {
    const found = new RegExp(`${name}: (\\d+)`).exec(block);
    return found === null ? undefined : Number(found[1]);
  };
  return { id: match[1], bytes: field("bytes"), width: field("width"), height: field("height") };
});

test("the manifest covers exactly the sky pictures", () => {
  assert.deepEqual(
    backdropEntries.map((entry) => entry.id).sort(),
    backdropSourceIds,
    "run `pnpm sprites:build` - the sky pictures and their sources have drifted apart"
  );
});

test("each sky picture matches the file it points at", () => {
  for (const entry of backdropEntries) {
    const path = join(BACKDROPS, `${entry.id}.webp`);
    const stats = statSync(path);
    assert.equal(stats.size, entry.bytes, `${entry.id}.webp is ${String(stats.size)} bytes`);
    assert.ok(
      stats.size <= MAX_BACKDROP_BYTES,
      `${entry.id}.webp is ${String(Math.round(stats.size / 1024))} KiB, over the ceiling`
    );
    const size = webpSize(readFileSync(path));
    assert.equal(size.width, entry.width, `${entry.id}: width differs from the file`);
    assert.equal(size.height, entry.height, `${entry.id}: height differs from the file`);
  }
});

test("the protocol names exactly the sky pictures that were built", () => {
  // `none` is the empty sky and has no file; every other picture must have one.
  assert.deepEqual(BACKDROP_IMAGES.filter((image) => image !== "none").sort(), backdropSourceIds);
});

const HUD = join(PACKAGE, "hud");
const HUD_SOURCES = join(PACKAGE, "sources", "hud");
/** Every frame is fetched before the first fight, so each one stays small. */
const MAX_HUD_BYTES = 160 * 1024;

const hudSourceIds = readdirSync(HUD_SOURCES)
  .filter((entry) => entry.endsWith(".png"))
  .map((entry) => basename(entry, ".png"))
  .sort();
const hudEntries = [...hudManifest.matchAll(/^ {4}id: "([^"]+)",$/gm)].map((match) => {
  const block = hudManifest.slice(match.index, hudManifest.indexOf("\n  }", match.index));
  const field = (name) => {
    const found = new RegExp(`${name}: (\\d+)`).exec(block);
    return found === null ? undefined : Number(found[1]);
  };
  return { id: match[1], bytes: field("bytes"), width: field("width"), height: field("height") };
});

test("the manifest covers exactly the HUD frames", () => {
  assert.ok(hudSourceIds.length > 0, "no HUD frame sources found");
  assert.deepEqual(
    hudEntries.map((entry) => entry.id).sort(),
    hudSourceIds,
    "run `pnpm sprites:build` - the HUD frames and their sources have drifted apart"
  );
});

test("each HUD frame matches the file it points at", () => {
  for (const entry of hudEntries) {
    const path = join(HUD, `${entry.id}.webp`);
    const stats = statSync(path);
    assert.equal(stats.size, entry.bytes, `${entry.id}.webp is ${String(stats.size)} bytes`);
    assert.ok(
      stats.size <= MAX_HUD_BYTES,
      `${entry.id}.webp is ${String(Math.round(stats.size / 1024))} KiB, over the ceiling`
    );
    const size = webpSize(readFileSync(path));
    assert.equal(size.width, entry.width, `${entry.id}: width differs from the file`);
    assert.equal(size.height, entry.height, `${entry.id}: height differs from the file`);
  }
});
