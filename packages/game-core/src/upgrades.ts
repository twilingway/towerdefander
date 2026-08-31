import {
  type CombatStateFields,
  type ShipModuleDefinition,
  type TeamUpgradeOffer,
  type UpgradeCard,
  type UpgradeVoteCommand,
  type UpgradeVoteResult
} from "./combatTypes.ts";
import { TEAM_UPGRADE_PRICE } from "./combatConstants.ts";

/**
 * Which tier the crew is looking at.
 *
 * Purchases, not waves: one buy per intermission is the rule the economy
 * already runs on, so the tier index is exactly how many modules have been
 * bought. A wave gate on top of it would leave intermissions with nothing to
 * offer, and the credit price is already the pace-setter.
 *
 * Past the last tier the number is the tail, which repeats.
 */
export function availableTierIndex(purchasedCount: number, tierCount: number): number {
  return Math.min(purchasedCount, tierCount);
}

/**
 * The cards of the available tier, in the order the preset describes them.
 *
 * No randomness at all: the same run seed on the same tree buys the same
 * modules, so a comparison between two presets is a comparison of the presets.
 * A tier is seen once, because buying from it moves the index on, which is what
 * makes a module unrepeatable without a pool to exclude it from.
 */
export function createTeamUpgradeOffer(
  moduleTiers: readonly (readonly ShipModuleDefinition[])[],
  endlessTier: readonly ShipModuleDefinition[],
  purchasedCount: number,
  waveNumber: number
): TeamUpgradeOffer | null {
  const index = availableTierIndex(purchasedCount, moduleTiers.length);
  const spent = index >= moduleTiers.length;
  const modules = spent ? endlessTier : (moduleTiers[index] ?? []);
  if (modules.length === 0) return null;
  const cards: UpgradeCard[] = modules.map((module) => ({
    upgradeId: module.id,
    role: module.role,
    label: module.label,
    effects: module.effects,
    price: TEAM_UPGRADE_PRICE
  }));
  return {
    offerId: `offer-w${String(waveNumber)}`,
    waveNumber,
    tier: spent ? 0 : index + 1,
    cards
  };
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
