import { roleLabel } from "@spaceship-defender/client-shared";
import {
  CREW_ROLES,
  MODULE_TIER_COUNT,
  TEAM_UPGRADE_PRICE,
  summariseModuleEffects,
  type PublicTeamUpgradeView
} from "@spaceship-defender/protocol";

interface TeamUpgradeOverlayProps {
  readonly teamUpgrade: PublicTeamUpgradeView;
  readonly credits: number;
  readonly score: number;
  readonly waveNumber: number;
  readonly phaseTicksRemaining: number;
  /** Modules bought so far; the ribbon reads the crew's depth from its length. */
  readonly purchasedModules: readonly string[];
}

export function TeamUpgradeOverlay({
  teamUpgrade,
  credits,
  score,
  waveNumber,
  phaseTicksRemaining,
  purchasedModules
}: TeamUpgradeOverlayProps) {
  const offer = teamUpgrade.offer;
  const price = TEAM_UPGRADE_PRICE;
  return (
    <div className="encounter-overlay encounter-overlay--intermission" role="status">
      <p className="eyebrow">Волна {waveNumber} завершена</p>
      <h2>Голосование за общее улучшение</h2>
      <strong>Следующая волна через {formatCountdown(phaseTicksRemaining)}</strong>
      <TierRibbon bought={purchasedModules.length} tier={offer?.tier ?? 0} />
      <p className="intermission-economy">
        Очки экипажа: {score} · кредиты: {credits} · цена улучшения: {price}
      </p>
      {offer === null ? (
        <p>Сервер готовит карточки…</p>
      ) : (
        <ul className="intermission-cards" aria-label="Карточки командного голосования">
          {offer.cards.map((card) => {
            const voters = CREW_ROLES.filter(
              (role) => teamUpgrade.votes[role]?.upgradeId === card.upgradeId
            );
            return (
              <li
                className={`intermission-card${voters.length > 0 ? " intermission-card--voted" : ""}`}
                key={card.upgradeId}
              >
                <strong>{card.label}</strong>
                <small>{summariseModuleEffects(card.effects)}</small>
                <small>{roleLabel(card.role)}</small>
                <small>
                  {voters.length === 0
                    ? "Голосов нет"
                    : `Голоса: ${voters.map((role) => roleLabel(role)).join(", ")}`}
                </small>
              </li>
            );
          })}
        </ul>
      )}
      <p>
        {credits < price
          ? "Кредитов не хватает — улучшение не купится."
          : "Побеждает большинство голосов, при равенстве — карточка левее в этом ряду."}
      </p>
    </div>
  );
}

/**
 * Where the crew is in the tree: what is behind them, what is on screen, and
 * how much is still ahead. The tree is the whole point of the choice, and it is
 * unreadable if the only thing shown is this wave's cards.
 */
function TierRibbon({ bought, tier }: { readonly bought: number; readonly tier: number }) {
  const steps = Array.from({ length: MODULE_TIER_COUNT }, (_unused, index) => index + 1);
  const spent = tier === 0;
  return (
    <div className="tier-ribbon" aria-label="Путь по дереву модулей">
      {steps.map((step) => (
        <span
          key={step}
          className={`tier-ribbon__step${step <= bought ? " is-done" : ""}${
            step === tier ? " is-current" : ""
          }`}
        />
      ))}
      <small>
        {spent
          ? `Дерево пройдено: ${String(bought)} модулей, дальше повторяемые`
          : `Тир ${String(tier)} из ${String(MODULE_TIER_COUNT)} · куплено ${String(bought)}`}
      </small>
    </div>
  );
}

function formatCountdown(ticks: number): string {
  return `${(ticks / 20).toFixed(1)} с`;
}
