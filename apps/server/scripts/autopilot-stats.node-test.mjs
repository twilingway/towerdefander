import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const harness = fileURLToPath(new URL("./run-autopilot-stats.mjs", import.meta.url));
const preset = fileURLToPath(new URL("../data/balance.json", import.meta.url));

function run(args) {
  return execFileSync(process.execPath, [harness, ...args], { encoding: "utf8" });
}

const baseline = ["--runs", "2", "--seed", "11", "--level", "ace", "--max-waves", "4", "--json"];

test("a seeded run replays bit for bit", () => {
  // This is the whole contract of the harness. Anything read off the wall clock
  // inside the loop would show up here and nowhere else, and a balance number
  // that cannot be reproduced is not a measurement.
  const first = run([...baseline, "--preset", preset]);
  const second = run([...baseline, "--preset", preset]);
  assert.equal(first, second);

  const report = JSON.parse(first);
  assert.equal(report.runs, 2);
  assert.equal(report.results.length, 2);
  for (const result of report.results) {
    assert.ok(result.wave >= 1);
    assert.ok(result.ticks > 0);
    // Only defeat exists: the campaign never ends in a win.
    assert.ok(result.outcome === "defeat" || result.outcome === "unfinished");
  }
});

test("different seeds play different runs", () => {
  const left = JSON.parse(run([...baseline, "--preset", preset]));
  const right = JSON.parse(
    run([
      "--runs",
      "2",
      "--seed",
      "900",
      "--level",
      "ace",
      "--max-waves",
      "4",
      "--json",
      "--preset",
      preset
    ])
  );
  assert.notDeepEqual(
    left.results.map(({ score }) => score),
    right.results.map(({ score }) => score)
  );
});

test("the intermission override reaches the simulation", () => {
  const report = JSON.parse(
    run([
      "--runs",
      "1",
      "--seed",
      "3",
      "--level",
      "ace",
      "--max-waves",
      "3",
      "--json",
      "--intermission",
      "2",
      "--preset",
      preset
    ])
  );
  assert.equal(report.intermissionSeconds, 2);
});

test("the harness runs without --preset", () => {
  // The server's own preset file is the fallback, so a bare `pnpm stats:autopilot`
  // measures something instead of throwing on a missing autopilot section.
  const report = JSON.parse(run(["--runs", "1", "--seed", "5", "--max-waves", "2", "--json"]));
  assert.equal(report.runs, 1);
  assert.ok(report.presetId.length > 0);
});

test("every crew size plays, including the one the shield autopilot holds", () => {
  // Crew 1 and 2 have no shield seat, so the run only survives if the server's
  // shield autopilot loads from plain node — which it does only while
  // `shieldAutopilot.ts` keeps to type-only imports.
  for (const crew of ["1", "2", "3"]) {
    const report = JSON.parse(
      run(["--runs", "1", "--seed", "7", "--max-waves", "3", "--crew", crew, "--json"])
    );
    assert.equal(report.crewSize, Number(crew));
    assert.ok(report.results[0].ticks > 0);
  }
});

test("the enemy difficulty offset reaches the simulation", () => {
  const base = ["--runs", "2", "--seed", "21", "--max-waves", "8", "--json"];
  const easy = JSON.parse(run([...base, "--enemy-offset=-2"]));
  const hard = JSON.parse(run([...base, "--enemy-offset=2"]));
  assert.equal(easy.enemyOffset, -2);
  assert.equal(hard.enemyOffset, 2);
  assert.notDeepEqual(
    easy.results.map(({ score }) => score),
    hard.results.map(({ score }) => score)
  );
});

test("a batch buys more than one kind of upgrade", async () => {
  const { mkdtemp, readFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const batch = fileURLToPath(new URL("./run-balance-batch.mjs", import.meta.url));
  const directory = await mkdtemp(join(tmpdir(), "spaceship-batch-"));
  try {
    execFileSync(
      process.execPath,
      [
        batch,
        "--out",
        directory,
        "--levels",
        "veteran",
        "--offsets",
        "0",
        "--crews",
        "3",
        "--runs",
        "2",
        "--seed",
        "1",
        "--max-waves",
        "8"
      ],
      { encoding: "utf8" }
    );
    const { readdir } = await import("node:fs/promises");
    const files = (await readdir(directory)).filter((name) => !name.includes(".runs."));
    const report = JSON.parse(await readFile(join(directory, files[0]), "utf8"));
    assert.equal(report.status, "complete");
    const bought = Object.keys(report.cells[0].upgradesBought);
    // The old harness always bought `cards[0]`, which is structurally the pilot
    // card, so this assertion fails on that behaviour.
    assert.ok(bought.length > 1, `expected several upgrade kinds, got ${bought.join(",")}`);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
