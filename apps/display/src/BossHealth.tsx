import type { DisplayGameSnapshot } from "@spaceship-defender/protocol";

import { getResourcePercent, selectBoss } from "./combatHudViewModel.js";

interface BossHealthProps {
  readonly game: DisplayGameSnapshot;
}

/**
 * The one enemy worth a bar of its own, under the wave clock. It exists only
 * while the boss does: the crew reads "is it nearly over" off this and nothing
 * else, so a stale bar would be worse than none.
 */
export function BossHealth({ game }: BossHealthProps) {
  const boss = selectBoss(game);
  if (boss === undefined) return null;
  const percent = getResourcePercent(boss.hp, boss.maxHp);
  return (
    <div className="boss-health" data-testid="boss-health" data-entity-id={boss.entityId}>
      <span>
        {boss.label}
        {boss.name === undefined ? "" : ` · ${boss.name}`}
      </span>
      <div
        className="boss-health__bar"
        role="meter"
        aria-label={`Здоровье босса: ${boss.label}`}
        aria-valuemin={0}
        aria-valuemax={Math.round(boss.maxHp)}
        aria-valuenow={Math.ceil(boss.hp)}
        aria-valuetext={`${String(Math.ceil(boss.hp))} из ${String(Math.round(boss.maxHp))}`}
      >
        <i style={{ width: `${String(percent)}%` }} />
      </div>
      <small>
        {Math.ceil(boss.hp)} / {Math.round(boss.maxHp)}
      </small>
    </div>
  );
}
