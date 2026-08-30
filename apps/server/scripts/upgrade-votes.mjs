import { voteForTeamUpgrade } from "@spaceship-defender/game-core";

import { planUpgradeVotes } from "../../controller/scripts/upgrade-vote-policy.mjs";

/**
 * Vote the way the crew policy says, once per offer. The harness used to buy
 * `cards[0]`, which is structurally always the pilot card, so every measured
 * run flew the same ship and the gunner and shield branches of the catalogue
 * were never exercised at all.
 */
export function castUpgradeVotes(state, context) {
  const offer = state.teamUpgradeOffer;
  if (offer === undefined || offer === null) return state;

  const votes = planUpgradeVotes(offer, {
    seed: state.runSeed,
    waveNumber: state.waveNumber,
    crewSize: context.crewSize,
    level: context.level,
    ship: {
      hp: state.spaceshipHp,
      maxHp: state.ship.spaceshipMaxHp,
      shieldEnergy: state.shieldEnergy,
      shieldCapacity: state.ship.shieldCapacity,
      waveSeconds: context.waveSeconds
    }
  });

  let current = state;
  for (const vote of votes) {
    // Planning is deterministic per offer, so a recorded vote never needs
    // changing and a second attempt would only earn a stale rejection.
    if (current.teamUpgradeVotes[vote.role] !== null) continue;
    const result = voteForTeamUpgrade(current, {
      role: vote.role,
      waveNumber: current.waveNumber,
      offerId: offer.offerId,
      upgradeId: vote.upgradeId,
      revision: 0
    });
    if (result.status === "accepted") current = result.state;
  }
  return current;
}
