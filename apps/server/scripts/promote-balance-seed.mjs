/**
 * Promotes the dev stand's balance into the committed seed.
 *
 * The volume on the production host is where the console writes and where the
 * game reads; the seed is what a release delivers. They are separate on
 * purpose, and the revision beside the seed is the only thing that says "play
 * these numbers" rather than "this file happened to change" -- reformatting a
 * file or migrating it to a newer version must not reach production on its own.
 *
 * The dev stand's own file is read straight from disk rather than over
 * `/admin/balance`, so this works with the stand stopped. That file lags the
 * code by however long ago the server last rewrote it, which is why the
 * document is migrated here with the very same migrations the server applies
 * when it reads.
 *
 * Usage:
 *   pnpm balance:promote [--from <path>] [--out <path>]
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { balancePresetsFileSchema } from "@spaceship-defender/protocol";

import { migrateBalanceDocument } from "../src/balance/migrations.ts";

const defaultSource = fileURLToPath(new URL("../data/balance.json", import.meta.url));
const defaultSeed = fileURLToPath(new URL("../presets/production.json", import.meta.url));
/** The revision lives beside its seed, so `--out` moves both together. */
function revisionPathFor(seed) {
  return `${seed.replace(/\.json$/i, "")}.revision`;
}

const usage = `Usage: pnpm balance:promote [--from <path>] [--out <path>]

  --from  Balance file to promote. Defaults to BALANCE_PRESET_PATH, then to the
          dev stand's own ${defaultSource}.
  --out   Seed to write. Defaults to ${defaultSeed}.

The revision beside the seed grows by one whenever the document changed; a run
that finds nothing to promote leaves both files alone.`;

function fail(message) {
  console.error(message);
  process.exit(1);
}

/**
 * Prettier decides how the seed is wrapped, and the committed file has to
 * satisfy `pnpm format:check`. Its output is not `JSON.stringify` with two
 * spaces -- it packs short arrays onto one line -- so the text goes through the
 * formatter before it is written, with the repository's own configuration.
 *
 * Through the API rather than a `pnpm exec` child: spawning a `.cmd` shim is
 * refused outright on Windows, and this is a formatter, not a build step.
 */
async function formatSeed(text, path) {
  try {
    const prettier = await import("prettier");
    const format = prettier.format ?? prettier.default.format;
    const resolveConfig = prettier.resolveConfig ?? prettier.default.resolveConfig;
    const options = (await resolveConfig(path)) ?? {};
    return await format(text, { ...options, filepath: path });
  } catch (error) {
    console.error(
      `Could not format the seed (${error.message}); ` +
        `run 'pnpm exec prettier --write ${path}' before committing.`
    );
    return text;
  }
}

async function readDocument(path, what) {
  let text;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return undefined;
    fail(`Could not read the ${what} at ${path}: ${error.message}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    fail(`The ${what} at ${path} is not valid JSON: ${error.message}`);
  }
}

async function readRevision(revisionPath) {
  try {
    const text = await readFile(revisionPath, "utf8");
    const parsed = Number.parseInt(text.trim(), 10);
    if (!Number.isInteger(parsed) || parsed < 0) {
      fail(`The revision at ${revisionPath} is not a non-negative integer.`);
    }
    return parsed;
  } catch (error) {
    if (error.code === "ENOENT") return 0;
    fail(`Could not read the revision at ${revisionPath}: ${error.message}`);
  }
}

const { values } = parseArgs({
  options: {
    from: { type: "string" },
    out: { type: "string" },
    help: { type: "boolean", default: false }
  }
});

if (values.help) {
  console.log(usage);
  process.exit(0);
}

const configuredSource = process.env.BALANCE_PRESET_PATH?.trim();
const sourcePath = resolve(
  values.from ??
    (configuredSource === undefined || configuredSource.length === 0
      ? defaultSource
      : configuredSource)
);
const seedPath = resolve(values.out ?? defaultSeed);
const revisionPath = revisionPathFor(seedPath);

const rawSource = await readDocument(sourcePath, "balance file");
if (rawSource === undefined) {
  fail(`No balance file at ${sourcePath}. Run the dev stand once, or pass --from.`);
}

const migrated = balancePresetsFileSchema.safeParse(migrateBalanceDocument(rawSource));
if (!migrated.success) {
  fail(
    `The balance at ${sourcePath} is not a balance document: ${migrated.error.issues[0]?.message ?? "invalid"}`
  );
}
// A seed with no presets would start the next host on nothing, and it would be
// committed before anyone noticed.
if (migrated.data.presets.length === 0) {
  fail(`The balance at ${sourcePath} holds no presets.`);
}

const document = migrated.data;
const existingSeed = await readDocument(seedPath, "seed");
const revision = await readRevision(revisionPath);

if (existingSeed !== undefined && JSON.stringify(existingSeed) === JSON.stringify(document)) {
  console.log(`Nothing to promote: the seed already holds these numbers (revision ${revision}).`);
  process.exit(0);
}

await writeFile(
  seedPath,
  await formatSeed(`${JSON.stringify(document, null, 2)}\n`, seedPath),
  "utf8"
);

const nextRevision = revision + 1;
await writeFile(revisionPath, `${String(nextRevision)}\n`, "utf8");

console.log(
  `Promoted ${sourcePath}\n` +
    `  version ${String(document.version)}, active ${document.activePresetId}, ` +
    `${String(document.presets.length)} preset(s)\n` +
    `  seed ${seedPath}\n` +
    `  revision ${String(revision)} -> ${String(nextRevision)}\n` +
    "Commit both files; the next release delivers them to the production volume."
);
