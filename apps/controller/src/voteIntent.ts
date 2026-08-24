import type { UpgradeId } from "@spaceship-defender/protocol";

export interface VoteIntent {
  readonly offerId: string;
  readonly upgradeId: UpgradeId;
  readonly revision: number;
  readonly actionId: string;
}

export interface VoteProjection {
  readonly offerId: string | undefined;
  readonly acceptedRevision: number;
}

/**
 * A vote is optimistic only until the authoritative projection catches up: the
 * server publishes the accepted revision per role, so the pending intent may be
 * dropped once that revision lands, and must be dropped when the offer changes.
 */
export function keepVoteIntent(
  pending: VoteIntent | undefined,
  projection: VoteProjection
): VoteIntent | undefined {
  if (pending === undefined) return undefined;
  if (projection.offerId !== pending.offerId) return undefined;
  return projection.acceptedRevision >= pending.revision ? undefined : pending;
}

/** Revisions are strictly increasing per role, so a rejected vote reuses none. */
export function nextVoteRevision(acceptedRevision: number): number {
  return acceptedRevision + 1;
}
