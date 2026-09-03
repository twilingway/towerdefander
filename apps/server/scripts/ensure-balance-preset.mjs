/**
 * Puts the packaged balance defaults where the measurement harnesses look, when
 * nothing is there yet.
 *
 * `balance-run.mjs` reads `apps/server/data/balance.json` -- the operator's live
 * file, deliberately, so a console edit moves the numbers. That file is written
 * at runtime and is not in the repository, so on a fresh checkout it does not
 * exist and every harness that reads it dies on ENOENT. A machine that has run
 * the game hides this; continuous integration does not.
 *
 * An existing file is never touched: the operator's tuning is the point of the
 * measurement, and overwriting it with defaults would silently answer a
 * different question.
 *
 * The defaults live in `src/balance/store.ts`, which imports its siblings with
 * `.js` specifiers, so plain `node` cannot load it -- hence the tsx child.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const presetPath = fileURLToPath(new URL("../data/balance.json", import.meta.url));
const storeUrl = new URL("../src/balance/store.ts", import.meta.url).href;

export function ensureBalancePreset() {
  if (existsSync(presetPath)) return presetPath;

  const program = [
    "import { mkdir, writeFile } from 'node:fs/promises';",
    "import { dirname } from 'node:path';",
    `import { createDefaultPresetsFile } from ${JSON.stringify(storeUrl)};`,
    `const target = ${JSON.stringify(presetPath)};`,
    "await mkdir(dirname(target), { recursive: true });",
    "await writeFile(target, `${JSON.stringify(createDefaultPresetsFile(), null, 2)}\\n`, 'utf8');"
  ].join("\n");

  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", program],
    { cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8", stdio: "inherit" }
  );
  if (result.status !== 0) {
    throw new Error(`Could not write balance defaults to ${presetPath}.`);
  }
  return presetPath;
}

// Also usable on its own: `node scripts/ensure-balance-preset.mjs`.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(ensureBalancePreset());
}
