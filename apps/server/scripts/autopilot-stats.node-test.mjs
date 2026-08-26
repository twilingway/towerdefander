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
