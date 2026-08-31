import {
  CREW_ROLES,
  TEAM_UPGRADE_PRICE,
  type CrewRole,
  type PublicTeamUpgradeView,
  type UpgradeId
} from "@spaceship-defender/protocol";
import { roleLabel } from "@spaceship-defender/client-shared";
import { useEffect, useRef, useState } from "react";

import { createActionId } from "../../model/actionId.js";
import { keepVoteIntent, nextVoteRevision, type VoteIntent } from "../../voteIntent.js";

export function TeamUpgradePanel({
  role,
  teamUpgrade,
  credits,
  phaseTicksRemaining,
  reconnecting,
  connectionEpoch,
  errorEpoch,
  onVote
}: {
  readonly role: CrewRole;
  readonly teamUpgrade: PublicTeamUpgradeView;
  readonly credits: number;
  readonly phaseTicksRemaining: number;
  readonly reconnecting: boolean;
  readonly connectionEpoch: number;
  readonly errorEpoch: number;
  readonly onVote: (upgradeId: UpgradeId, revision: number, actionId: string) => void;
}) {
  const pendingReference = useRef<VoteIntent | undefined>(undefined);
  const sentRevisionReference = useRef(0);
  const voteReference = useRef(onVote);
  voteReference.current = onVote;
  const [pendingUpgradeId, setPendingUpgradeId] = useState<UpgradeId>();
  const offer = teamUpgrade.offer;
  const offerId = offer?.offerId;
  const ownVote = teamUpgrade.votes[role];
  const ownRevision = ownVote?.revision ?? 0;
  const ownUpgradeId = ownVote?.upgradeId;

  useEffect(() => {
    const pending = pendingReference.current;
    if (pending !== undefined && pending.offerId === offerId && !reconnecting) {
      voteReference.current(pending.upgradeId, pending.revision, pending.actionId);
    }
  }, [connectionEpoch, offerId, reconnecting]);

  useEffect(() => {
    const kept = keepVoteIntent(pendingReference.current, {
      offerId,
      acceptedRevision: ownRevision
    });
    pendingReference.current = kept;
    if (kept === undefined) setPendingUpgradeId(undefined);
  }, [offerId, ownRevision]);

  useEffect(() => {
    // Every offer restarts the authoritative revision sequence for this role.
    sentRevisionReference.current = 0;
  }, [offerId]);

  useEffect(() => {
    // A rejected vote never reaches the projection, so a server error is the
    // only signal that this one is not on its way any more. Errors the ballot
    // did not cause land here too, which costs nothing but a cleared label.
    if (errorEpoch === 0) return;
    pendingReference.current = undefined;
    setPendingUpgradeId(undefined);
  }, [errorEpoch]);

  if (offer === null) {
    return (
      <div className="upgrade-panel" role="status">
        <h2>Подготавливаем улучшения…</h2>
        <p>Выбор появится после синхронизации с сервером.</p>
      </div>
    );
  }

  // The protocol pins one price for every card; reading it from a card would
  // report 0 for an empty offer and hide the insufficient-credits warning.
  const price = TEAM_UPGRADE_PRICE;
  return (
    <div className="upgrade-panel">
      <p className="eyebrow">Передышка · {(phaseTicksRemaining / 20).toFixed(1)} с</p>
      <h2>Общее улучшение экипажа</h2>
      <p className="upgrade-balance">
        Кредиты экипажа: <strong>{credits}</strong> · цена {price}
      </p>
      {credits < price && (
        <p className="upgrade-warning">Кредитов не хватает — улучшение не купится.</p>
      )}
      <div className="upgrade-grid" aria-label="Карточки командного голосования">
        {offer.cards.map((card) => {
          const voters = CREW_ROLES.filter(
            (crewRole) => teamUpgrade.votes[crewRole]?.upgradeId === card.upgradeId
          );
          const chosen = ownUpgradeId === card.upgradeId;
          const pending = pendingUpgradeId === card.upgradeId;
          return (
            <button
              type="button"
              className={`upgrade-card ${chosen ? "upgrade-card--selected" : ""}`}
              key={card.upgradeId}
              data-upgrade-id={card.upgradeId}
              data-price={card.price}
              aria-pressed={chosen}
              /* A vote in flight never locks the ballot: a lost or rejected
                 command must not cost the crew its remaining seconds. */
              disabled={reconnecting}
              onClick={() => {
                const actionId = createActionId();
                const revision = nextVoteRevision(ownRevision, sentRevisionReference.current);
                sentRevisionReference.current = revision;
                pendingReference.current = {
                  offerId: offer.offerId,
                  upgradeId: card.upgradeId,
                  revision,
                  actionId
                };
                setPendingUpgradeId(card.upgradeId);
                onVote(card.upgradeId, revision, actionId);
              }}
            >
              <strong>{card.label}</strong>
              <small>{card.summary}</small>
              <small>{roleLabel(card.role)}</small>
              <small>
                {pending
                  ? "Отправляем голос…"
                  : voters.length === 0
                    ? "Голосов нет"
                    : `Голоса: ${voters.map((crewRole) => roleLabel(crewRole)).join(", ")}`}
              </small>
            </button>
          );
        })}
      </div>
      <p className="upgrade-hint">
        Побеждает карточка с большинством голосов, при равенстве — та, что левее в ряду. Голос можно
        менять до конца передышки.
      </p>
    </div>
  );
}
