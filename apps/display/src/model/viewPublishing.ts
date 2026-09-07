import type { DisplayRoomView, PublicUpgradeVote } from "@spaceship-defender/protocol";

/**
 * How long a purely continuous change may wait before React is told.
 *
 * The world reaches the scene through a reference and is redrawn every frame,
 * so what this delays is the surrounding page: numbers, rings, the roster. A
 * fifth of a second is below what a reader notices on a counter and well above
 * the patch, which is the whole point - a phone was spending seventy
 * milliseconds a second committing a tree whose shape had not changed, and the
 * worst of those commits was half a frame.
 */
export const PASSIVE_PUBLISH_MS = 200;

function sameVote(previous: PublicUpgradeVote | null, next: PublicUpgradeVote | null): boolean {
  if (previous === null || next === null) return previous === next;
  return previous.upgradeId === next.upgradeId && previous.revision === next.revision;
}

/**
 * Whether this patch has to reach the page at once rather than wait for the
 * next passive publish.
 *
 * The rule is what a hand is waiting for: anything that answers a tap, opens or
 * closes a screen, or changes who is in the room. Everything else - positions,
 * hulls, heat, credits ticking up - is a number that may arrive a fifth of a
 * second later without anyone being able to tell.
 *
 * A field missed here costs a moment of lag, never correctness: the value still
 * lands on the next publish.
 */
export function hasImmediateChange(
  previous: DisplayRoomView | undefined,
  next: DisplayRoomView
): boolean {
  if (previous === undefined) return true;
  if (
    previous.phase !== next.phase ||
    previous.runNumber !== next.runNumber ||
    previous.crewSize !== next.crewSize ||
    previous.shipArchetypeId !== next.shipArchetypeId ||
    previous.displayConnected !== next.displayConnected ||
    previous.maintenanceActive !== next.maintenanceActive
  ) {
    return true;
  }
  if (previous.players.length !== next.players.length) return true;
  for (const [index, player] of next.players.entries()) {
    const before = previous.players[index];
    if (before === undefined) return true;
    if (
      before.playerId !== player.playerId ||
      before.role !== player.role ||
      before.ready !== player.ready ||
      before.connected !== player.connected
    ) {
      return true;
    }
  }

  const before = previous.game;
  const after = next.game;
  if ((before === null) !== (after === null)) return true;
  if (before === null || after === null) return false;
  if (
    before.encounter.phase !== after.encounter.phase ||
    before.encounter.outcome !== after.encounter.outcome ||
    before.encounter.defeatReason !== after.encounter.defeatReason ||
    before.encounter.waveNumber !== after.encounter.waveNumber ||
    before.shieldPhase !== after.shieldPhase ||
    before.purchasedModules.length !== after.purchasedModules.length
  ) {
    return true;
  }

  const offered = before.teamUpgrade.offer?.offerId ?? null;
  const offering = after.teamUpgrade.offer?.offerId ?? null;
  if (offered !== offering) return true;
  if ((before.teamUpgrade.selection === null) !== (after.teamUpgrade.selection === null)) {
    return true;
  }
  if (before.teamUpgrade.selection?.upgradeId !== after.teamUpgrade.selection?.upgradeId) {
    return true;
  }
  return !(
    sameVote(before.teamUpgrade.votes.pilot, after.teamUpgrade.votes.pilot) &&
    sameVote(before.teamUpgrade.votes.gunner, after.teamUpgrade.votes.gunner) &&
    sameVote(before.teamUpgrade.votes.shield, after.teamUpgrade.votes.shield)
  );
}
