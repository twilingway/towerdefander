import { type EnemySkillLevel } from "@spaceship-defender/protocol";

/** Shared by the skill tab and the enemy card, which is why it lives here. */
export const ENEMY_SKILL_LEVEL_LABELS: Record<EnemySkillLevel, string> = {
  rookie: "Новичок",
  veteran: "Ветеран",
  ace: "Ас"
};
