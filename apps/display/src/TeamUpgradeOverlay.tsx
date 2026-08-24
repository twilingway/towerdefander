import {
  CREW_ROLES,
  type CrewRole,
  type PublicTeamUpgradeView
} from "@spaceship-defender/protocol";

interface TeamUpgradeOverlayProps {
  readonly teamUpgrade: PublicTeamUpgradeView;
  readonly credits: number;
  readonly score: number;
  readonly waveNumber: number;
  readonly phaseTicksRemaining: number;
}

export function TeamUpgradeOverlay({
  teamUpgrade,
  credits,
  score,
  waveNumber,
  phaseTicksRemaining
}: TeamUpgradeOverlayProps) {
  const offer = teamUpgrade.offer;
  const price = offer?.cards[0]?.price ?? 0;
  return (
    <div className="encounter-overlay encounter-overlay--intermission" role="status">
      <p className="eyebrow">Волна {waveNumber} завершена</p>
      <h2>Голосование за общее улучшение</h2>
      <strong>Следующая волна через {formatCountdown(phaseTicksRemaining)}</strong>
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
          : "Побеждает большинство голосов, при равенстве — первая карточка по порядку ролей."}
      </p>
    </div>
  );
}

function formatCountdown(ticks: number): string {
  return `${(ticks / 20).toFixed(1)} с`;
}

function roleLabel(role: CrewRole): string {
  return role === "pilot" ? "Пилот" : role === "gunner" ? "Наводчик" : "Оператор щита";
}
