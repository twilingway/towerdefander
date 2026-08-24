import { describe, expect, it } from "vitest";

import { keepVoteIntent, nextVoteRevision, type VoteIntent } from "./voteIntent.js";

const intent: VoteIntent = {
  offerId: "offer-w1",
  upgradeId: "pilot_speed",
  revision: 2,
  actionId: "0f1a4d5a-6f5f-4a05-9a48-4a6e1e2a2f11"
};

describe("vote intent", () => {
  it("keeps an unconfirmed vote while the authoritative revision lags behind", () => {
    expect(keepVoteIntent(intent, { offerId: "offer-w1", acceptedRevision: 1 })).toBe(intent);
  });

  it("releases the vote once the projection publishes that revision", () => {
    expect(keepVoteIntent(intent, { offerId: "offer-w1", acceptedRevision: 2 })).toBeUndefined();
    expect(keepVoteIntent(intent, { offerId: "offer-w1", acceptedRevision: 3 })).toBeUndefined();
  });

  it("releases the vote when the offer is replaced or withdrawn", () => {
    expect(keepVoteIntent(intent, { offerId: "offer-w2", acceptedRevision: 0 })).toBeUndefined();
    expect(keepVoteIntent(intent, { offerId: undefined, acceptedRevision: 0 })).toBeUndefined();
  });

  it("has nothing to keep without a pending vote", () => {
    expect(keepVoteIntent(undefined, { offerId: "offer-w1", acceptedRevision: 0 })).toBeUndefined();
  });

  it("always proposes a strictly newer revision than the accepted one", () => {
    expect(nextVoteRevision(0)).toBe(1);
    expect(nextVoteRevision(4)).toBe(5);
  });
});
