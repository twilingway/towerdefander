import assert from "node:assert/strict";
import test from "node:test";

import { CREW_ROLES, drawUpgradeCard, planUpgradeVotes } from "./upgrade-vote-policy.mjs";

/**
 * A tier three cards wide, one per seat. The bot reads what a card does from
 * its effects, not from its id, so the fixture carries them.
 */
function offer(waveNumber = 1) {
  return {
    offerId: `offer-w${String(waveNumber)}`,
    waveNumber,
    tier: 6,
    cards: [
      {
        upgradeId: "hullPlating2",
        role: "pilot",
        label: "hull",
        effects: [{ target: "spaceshipMaxHp", op: "add", value: 60 }],
        price: 5
      },
      {
        upgradeId: "heavyRounds",
        role: "gunner",
        label: "damage",
        effects: [{ target: "friendlyProjectileDamage", op: "percent", value: 0.18 }],
        price: 5
      },
      {
        upgradeId: "capacitor2",
        role: "shield",
        label: "capacity",
        effects: [{ target: "shieldCapacity", op: "add", value: 40 }],
        price: 5
      }
    ]
  };
}

const healthy = { hp: 100, maxHp: 100, shieldEnergy: 100, shieldCapacity: 100, waveSeconds: 20 };

test("the same seed and wave draw the same card", () => {
  const context = { seed: 4242, waveNumber: 7, level: "ace", crewSize: 3, ship: healthy };
  const first = drawUpgradeCard(offer(7), context);
  const second = drawUpgradeCard(offer(7), { ...context });
  assert.equal(first.upgradeId, second.upgradeId);
});

test("different waves of one run do not all draw the same card", () => {
  const drawn = new Set();
  for (let wave = 1; wave <= 40; wave += 1) {
    drawn.add(
      drawUpgradeCard(offer(wave), {
        seed: 11,
        waveNumber: wave,
        level: "veteran",
        crewSize: 3,
        ship: healthy
      }).upgradeId
    );
  }
  assert.ok(drawn.size > 1, `expected more than one card across 40 waves, got ${[...drawn]}`);
});

test("the dissenting seat is the last seat of the crew", () => {
  const context = { seed: 5, waveNumber: 3, level: "ace", ship: healthy };
  for (const crewSize of [1, 2, 3]) {
    const votes = planUpgradeVotes(offer(3), { ...context, crewSize });
    assert.deepEqual(
      votes.map(({ role }) => role),
      CREW_ROLES.slice(0, crewSize)
    );
    const drawn = drawUpgradeCard(offer(3), { ...context, crewSize }).upgradeId;
    const last = votes[votes.length - 1];
    const expected = crewSize === 1 ? drawn : CREW_ROLES[crewSize - 1];
    if (crewSize === 1) {
      assert.equal(last.upgradeId, expected);
    } else {
      // The last seat votes its own role's card unless that is what was drawn.
      const ownCard = offer(3).cards.find(({ role }) => role === CREW_ROLES[crewSize - 1]);
      assert.equal(last.upgradeId, ownCard.upgradeId);
    }
    for (const vote of votes.slice(0, -1)) assert.equal(vote.upgradeId, drawn);
  }
});

test("no seat ever votes for a card outside the offer", () => {
  const cards = new Set(offer(9).cards.map(({ upgradeId }) => upgradeId));
  for (let seed = 1; seed <= 50; seed += 1) {
    const votes = planUpgradeVotes(offer(9), {
      seed,
      waveNumber: 9,
      level: "rookie",
      crewSize: 3,
      ship: healthy
    });
    for (const vote of votes) assert.ok(cards.has(vote.upgradeId));
  }
});

test("an empty offer produces no votes", () => {
  assert.deepEqual(
    planUpgradeVotes({ offerId: "empty", waveNumber: 1, cards: [] }, { seed: 1, level: "ace" }),
    []
  );
});

function hullShare(level, ship) {
  let hull = 0;
  for (let wave = 1; wave <= 400; wave += 1) {
    const card = drawUpgradeCard(offer(wave), { seed: 99, waveNumber: wave, level, ship });
    if (card.upgradeId === "hullPlating2") hull += 1;
  }
  return hull / 400;
}

test("a rookie ignores the ship's condition and an ace answers it", () => {
  const hurt = { hp: 8, maxHp: 100, shieldEnergy: 100, shieldCapacity: 100, waveSeconds: 20 };
  assert.equal(hullShare("rookie", healthy), hullShare("rookie", hurt));
  assert.ok(
    hullShare("ace", hurt) > hullShare("ace", healthy),
    "a hurt ship must raise the hull card's share for an ace"
  );
});
