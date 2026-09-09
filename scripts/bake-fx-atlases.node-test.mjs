// The on-disk half of the effect catalogue's contract: that what
// `pnpm fx:bake` committed still matches what the manifest claims.
//
// This lives outside vitest because it reads files, and the fx-assets package
// is browser-side with no Node types. It is the same split the balance harnesses
// use: pure logic in vitest, the file contract under `node --test`.
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

// Imported from source: Node strips the types, which is how the other harnesses
// in this repository read the protocol too. It also keeps `fx-assets` free of a
// dependency on the protocol - the check belongs to the bake, not to the pixels.
import { FX_EFFECT_IDS, FX_EVENT_EFFECT_IDS } from "../packages/protocol/src/effectCatalogue.ts";

const PACKAGE = fileURLToPath(new URL("../packages/fx-assets/", import.meta.url));
const EFFECTS = join(PACKAGE, "effects");
const ATLASES = join(PACKAGE, "atlases");
/** These are the repository's only binary files; keep them small on purpose. */
const MAX_ATLAS_BYTES = 512 * 1024;

const sourceIds = readdirSync(EFFECTS)
  .filter((entry) => entry.endsWith(".json") && entry !== "catalogue.json")
  .map((entry) => basename(entry, ".json"))
  .sort();
const catalogue = JSON.parse(readFileSync(join(EFFECTS, "catalogue.json"), "utf8"));
const manifest = readFileSync(join(PACKAGE, "src", "manifest.ts"), "utf8");

/** The generated manifest is TypeScript, so read the fields out of its text. */
const manifestEntries = [...manifest.matchAll(/^ {4}id: "([^"]+)",$/gm)].map((match) => {
  const id = match[1];
  const block = manifest.slice(match.index, manifest.indexOf("\n  }", match.index));
  const field = (name) => {
    const found = new RegExp(`${name}: ([-\\d.]+)`).exec(block);
    return found === null ? undefined : Number(found[1]);
  };
  return {
    id,
    bytes: field("bytes"),
    frameWidth: field("frameWidth"),
    frameHeight: field("frameHeight"),
    cols: field("cols"),
    rows: field("rows"),
    frames: field("frames")
  };
});

test("every effect source is described in the catalogue", () => {
  assert.ok(sourceIds.length > 0, "no effect sources found");
  for (const id of sourceIds) {
    const entry = catalogue[id];
    assert.ok(entry, `${id}.json has no catalogue.json entry`);
    assert.ok(entry.title, `${id} has no title`);
    assert.ok(entry.category, `${id} has no category`);
  }
});

test("the catalogue describes nothing that was removed", () => {
  for (const id of Object.keys(catalogue)) {
    assert.ok(sourceIds.includes(id), `catalogue.json still lists ${id}, which has no source`);
  }
});

test("the manifest covers exactly the baked effects", () => {
  assert.deepEqual(
    manifestEntries.map((entry) => entry.id).sort(),
    sourceIds,
    "run `pnpm fx:bake` - the manifest and the sources have drifted apart"
  );
});

test("each manifest entry matches the file it points at", () => {
  for (const entry of manifestEntries) {
    const png = join(ATLASES, `${entry.id}.png`);
    const stats = statSync(png);
    // A hand-edited manifest, or a PNG committed without a re-bake, shows up
    // here and nowhere else: the app would just draw the wrong grid.
    assert.equal(stats.size, entry.bytes, `${entry.id}.png is ${String(stats.size)} bytes`);
    assert.ok(
      stats.size <= MAX_ATLAS_BYTES,
      `${entry.id}.png is ${String(Math.round(stats.size / 1024))} KiB, over the ceiling`
    );
    const meta = JSON.parse(readFileSync(join(ATLASES, `${entry.id}.meta.json`), "utf8"));
    for (const field of ["frameWidth", "frameHeight", "cols", "rows", "frames"]) {
      assert.equal(meta[field], entry[field], `${entry.id}: ${field} differs from its meta`);
    }
    assert.ok(
      meta.frames <= meta.cols * meta.rows,
      `${entry.id}: ${String(meta.frames)} frames will not fit the grid`
    );
  }
});

test("every effect source still parses and names its own export grid", () => {
  for (const id of sourceIds) {
    const file = JSON.parse(readFileSync(join(EFFECTS, `${id}.json`), "utf8"));
    assert.equal(file.app, "arcadia-effects", `${id}: not an Arcadia Effects file`);
    assert.ok(file.doc?.id, `${id}: the document has no stable id`);
    assert.ok(Array.isArray(file.doc.layers) && file.doc.layers.length > 0, `${id}: no layers`);
    const grid = file.doc.exp;
    assert.ok(grid, `${id}: no export block`);
    assert.ok(
      grid.frames <= grid.cols * grid.rows,
      `${id}: exp.frames exceeds the grid, so the bake would clamp it silently`
    );
  }
});

test("the protocol names exactly the effects that were baked", () => {
  // The server validates a preset against the protocol's list, and the atlases
  // live in a package the server never sees. Baking an effect without naming it
  // in the protocol would leave an atlas no preset could reference; naming one
  // that was never baked would let a preset ask for a missing texture.
  assert.deepEqual([...FX_EFFECT_IDS].sort(), sourceIds);
});

test("every event effect is a one-shot that exists", () => {
  const loops = new Set();
  for (const id of sourceIds) {
    const file = JSON.parse(readFileSync(join(EFFECTS, `${id}.json`), "utf8"));
    // A loop has no natural end, so hanging one on an event would either play
    // forever or be cut off mid-cycle.
    if (catalogue[id]?.loop === true) loops.add(id);
    assert.ok(file.doc, `${id}: no document`);
  }
  for (const id of FX_EVENT_EFFECT_IDS) {
    assert.ok(sourceIds.includes(id), `${id} is an event effect with no source`);
    assert.ok(!loops.has(id), `${id} is a loop and cannot be hung on an event`);
  }
});
