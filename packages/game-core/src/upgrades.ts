import {
  type CombatStateFields,
  type TeamUpgradeOffer,
  type UpgradeCard,
  type UpgradeVoteCommand,
  type UpgradeVoteResult
} from "./combatTypes.ts";
import { OFFER_DOMAIN, ROLES, TEAM_UPGRADE_PRICE } from "./combatConstants.ts";
import { deriveDomainSeed, nextUint32 } from "./rng.ts";
import { UPGRADE_CATALOGUE, UPGRADE_IDS_BY_ROLE } from "./upgradeCatalogue.ts";

export function createTeamUpgradeOffer(
  runSeed: number,
  waveNumber: number
): {
  readonly offer: TeamUpgradeOffer;
  readonly rngState: number;
} {
  let rngState = deriveDomainSeed(runSeed, waveNumber, OFFER_DOMAIN);
  const cards: UpgradeCard[] = [];
  for (const role of ROLES) {
    const roleCards = UPGRADE_IDS_BY_ROLE[role].map((upgradeId) => ({
      upgradeId,
      label: UPGRADE_CATALOGUE[upgradeId].label,
      value: UPGRADE_CATALOGUE[upgradeId].value
    }));
    for (let index = roleCards.length - 1; index > 0; index -= 1) {
      const [next, random] = nextUint32(rngState);
      rngState = next;
      const swapIndex = random % (index + 1);
      const card = roleCards[index];
      const swap = roleCards[swapIndex];
      if (card !== undefined && swap !== undefined) {
        roleCards[index] = swap;
        roleCards[swapIndex] = card;
      }
    }
    const card = roleCards[0];
    if (card === undefined) throw new RangeError(`Upgrade pool for ${role} cannot be empty`);
    cards.push({ ...card, role, price: TEAM_UPGRADE_PRICE });
  }
  return { offer: { offerId: `offer-w${String(waveNumber)}`, waveNumber, cards }, rngState };
}

export function voteForTeamUpgrade<TState extends CombatStateFields>(
  state: TState,
  command: UpgradeVoteCommand
): UpgradeVoteResult<TState> {
  if (state.encounterPhase !== "intermission" || command.waveNumber !== state.waveNumber) {
    return { status: "action_not_available", state };
  }
  const offer = state.teamUpgradeOffer;
  const card = offer?.cards.find(({ upgradeId }) => upgradeId === command.upgradeId);
  if (offer?.offerId !== command.offerId || card === undefined) {
    return { status: "action_not_available", state };
  }
  const previous = state.teamUpgradeVotes[command.role];
  if (previous !== null && command.revision <= previous.revision) {
    return { status: "stale_action", state };
  }
  return {
    status: "accepted",
    state: {
      ...state,
      teamUpgradeVotes: {
        ...state.teamUpgradeVotes,
        [command.role]: {
          role: command.role,
          upgradeId: command.upgradeId,
          revision: command.revision
        }
      }
    }
  };
}
