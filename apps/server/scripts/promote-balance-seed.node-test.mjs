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
 * The stand's own file, copied rather than rewritten. Stamping it with an older
 * version to force a migration is what an earlier draft did, and it only worked
 * on a machine that already had an old file: the migration rescales everything
 * counted in ticks, so a document already written at the current rate came out
 * of it three times over its own ceiling. What the migration does to a genuinely
 * old preset is settled in `src/balance/balance.test.ts`; this file is about the
 * promotion around it.
 */
function stageSource(directory) {
  const source = join(directory, "balance.json");
  writeFileSync(source, readFileSync(livePreset, "utf8"), "utf8");
  return source;
}

test("the dev file reaches the seed and the revision starts at one", () => {
  const directory = mkdtempSync(join(tmpdir(), "promote-seed-"));
  const source = stageSource(directory);
  const seed = join(directory, "production.json");
  const sourceVersion = JSON.parse(readFileSync(source, "utf8")).version;

  promote(["--from", source, "--out", seed]);

  const written = JSON.parse(readFileSync(seed, "utf8"));
  assert.ok(
    written.version >= sourceVersion,
    `the seed went backwards: ${String(sourceVersion)} -> ${String(written.version)}`
  );
  assert.ok(written.presets.length > 0);
  assert.equal(readFileSync(join(directory, "production.revision"), "utf8").trim(), "1");
});

test("promoting the same numbers twice leaves the revision alone", () => {
  const directory = mkdtempSync(join(tmpdir(), "promote-seed-"));
  const source = stageSource(directory);
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
  const source = stageSource(directory);
  const seed = join(directory, "production.json");
  const revision = join(directory, "production.revision");
  promote(["--from", source, "--out", seed]);
  const before = readFileSync(seed, "utf8");

  writeFileSync(source, "{ not json", "utf8");

  assert.throws(() => promote(["--from", source, "--out", seed]));
  assert.equal(readFileSync(seed, "utf8"), before);
  assert.equal(readFileSync(revision, "utf8").trim(), "1");
});
