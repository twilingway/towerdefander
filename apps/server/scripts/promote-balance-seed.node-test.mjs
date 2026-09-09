import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { ensureBalancePreset } from "./ensure-balance-preset.mjs";

const script = fileURLToPath(new URL("./promote-balance-seed.mjs", import.meta.url));
const livePreset = ensureBalancePreset();

function promote(args) {
  return execFileSync(process.execPath, ["--import", "tsx", script, ...args], {
    encoding: "utf8"
  });
}

/**
 * The source is deliberately stamped with an older version than the code
 * carries: without the migration step the schema would reject it outright, so
 * this is what tells a working promotion from one that only copies the file.
 */
function stageOutdatedSource(directory) {
  const document = JSON.parse(readFileSync(livePreset, "utf8"));
  const source = join(directory, "balance.json");
  writeFileSync(source, `${JSON.stringify({ ...document, version: 30 }, null, 2)}\n`, "utf8");
  return source;
}

test("an outdated dev file is migrated into the seed and the revision starts at one", () => {
  const directory = mkdtempSync(join(tmpdir(), "promote-seed-"));
  const source = stageOutdatedSource(directory);
  const seed = join(directory, "production.json");

  promote(["--from", source, "--out", seed]);

  const written = JSON.parse(readFileSync(seed, "utf8"));
  assert.ok(written.version > 30, `expected a migrated version, got ${String(written.version)}`);
  assert.ok(written.presets.length > 0);
  assert.equal(readFileSync(join(directory, "production.revision"), "utf8").trim(), "1");
});

test("promoting the same numbers twice leaves the revision alone", () => {
  const directory = mkdtempSync(join(tmpdir(), "promote-seed-"));
  const source = stageOutdatedSource(directory);
  const seed = join(directory, "production.json");
  const revision = join(directory, "production.revision");

  promote(["--from", source, "--out", seed]);
  const afterFirst = readFileSync(seed, "utf8");
  const output = promote(["--from", source, "--out", seed]);

  assert.match(output, /Nothing to promote/);
  assert.equal(readFileSync(seed, "utf8"), afterFirst);
  assert.equal(readFileSync(revision, "utf8").trim(), "1");
});

test("a missing dev file writes neither the seed nor the revision", () => {
  const directory = mkdtempSync(join(tmpdir(), "promote-seed-"));
  const seed = join(directory, "production.json");

  assert.throws(() => promote(["--from", join(directory, "absent.json"), "--out", seed]));
  assert.equal(existsSync(seed), false);
  assert.equal(existsSync(join(directory, "production.revision")), false);
});

test("a broken dev file leaves an existing seed and its revision untouched", () => {
  const directory = mkdtempSync(join(tmpdir(), "promote-seed-"));
  const source = stageOutdatedSource(directory);
  const seed = join(directory, "production.json");
  const revision = join(directory, "production.revision");
  promote(["--from", source, "--out", seed]);
  const before = readFileSync(seed, "utf8");

  writeFileSync(source, "{ not json", "utf8");

  assert.throws(() => promote(["--from", source, "--out", seed]));
  assert.equal(readFileSync(seed, "utf8"), before);
  assert.equal(readFileSync(revision, "utf8").trim(), "1");
});
