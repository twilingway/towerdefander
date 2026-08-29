import { describe, expect, it } from "vitest";

import { defaultSpaceshipSimulationConfig } from "./defaultSimulationConfig.ts";
import { resolveEnemySkill } from "./enemySkill.ts";
import { type EnemySkillTuning } from "./combatTypes.ts";

const tuning: EnemySkillTuning = defaultSpaceshipSimulationConfig.enemySkill;

describe("resolveEnemySkill", () => {
  it("plays the archetype's own level when the difficulty is centred", () => {
    expect(resolveEnemySkill(tuning, "veteran")).toBe(tuning.profiles.veteran);
    expect(resolveEnemySkill({ ...tuning, offset: 0 }, "rookie")).toBe(tuning.profiles.rookie);
  });

  it("shifts every archetype by the same whole step", () => {
    expect(resolveEnemySkill({ ...tuning, offset: 1 }, "rookie")).toBe(tuning.profiles.veteran);
    expect(resolveEnemySkill({ ...tuning, offset: -1 }, "ace")).toBe(tuning.profiles.veteran);
  });

  it("saturates at both ends instead of falling off the list", () => {
    // The whole point of a shift over a replacement: past the end it clamps,
    // and an archetype already at the ceiling simply stays there.
    expect(resolveEnemySkill({ ...tuning, offset: 2 }, "veteran")).toBe(tuning.profiles.ace);
    expect(resolveEnemySkill({ ...tuning, offset: 2 }, "ace")).toBe(tuning.profiles.ace);
    expect(resolveEnemySkill({ ...tuning, offset: -2 }, "veteran")).toBe(tuning.profiles.rookie);
    expect(resolveEnemySkill({ ...tuning, offset: -2 }, "rookie")).toBe(tuning.profiles.rookie);
  });

  it("keeps the catalogue spread at every position of the control", () => {
    for (const offset of [-2, -1, 0, 1, 2]) {
      const shifted: EnemySkillTuning = { ...tuning, offset };
      const interceptor = resolveEnemySkill(shifted, "rookie");
      const boss = resolveEnemySkill(shifted, "ace");
      expect(boss.leadFactor).toBeGreaterThanOrEqual(interceptor.leadFactor);
    }
  });
});
