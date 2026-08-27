import {
  type CombatStateFields,
  type GameplayRole,
  type TeamUpgradeOffer,
  type UpgradeCard,
  type UpgradeVoteCommand,
  type UpgradeVoteResult
} from "./combatTypes.ts";
import { OFFER_DOMAIN, ROLES, TEAM_UPGRADE_PRICE } from "./combatConstants.ts";
import { deriveDomainSeed, nextUint32 } from "./rng.ts";

export function createTeamUpgradeOffer(
  runSeed: number,
  waveNumber: number
): {
  readonly offer: TeamUpgradeOffer;
  readonly rngState: number;
} {
  let rngState = deriveDomainSeed(runSeed, waveNumber, OFFER_DOMAIN);
  const pools: Readonly<Record<GameplayRole, readonly Omit<UpgradeCard, "role" | "price">[]>> = {
    pilot: [
      { upgradeId: "pilot_speed", label: "Maximum speed +10%", value: 0.1 },
      { upgradeId: "pilot_acceleration", label: "Acceleration +12%", value: 0.12 },
      { upgradeId: "pilot_hull", label: "Hull +25 and repair 25", value: 25 }
    ],
    gunner: [
      { upgradeId: "gunner_damage", label: "Damage +15%", value: 0.15 },
      { upgradeId: "gunner_cooldown", label: "Cooldown -10%", value: 0.1 },
      { upgradeId: "gunner_projectile_speed", label: "Projectile speed +12%", value: 0.12 }
    ],
    shield: [
      { upgradeId: "shield_capacity", label: "Capacity +20", value: 20 },
      { upgradeId: "shield_recharge", label: "Recharge +15%", value: 0.15 },
      { upgradeId: "shield_arc", label: "Arc width +10 degrees", value: Math.PI / 18 }
    ]
  };
  const cards: UpgradeCard[] = [];
  for (const role of ROLES) {
    const roleCards = [...pools[role]];
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
