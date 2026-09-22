import type { UpgradeVoteCommand } from "@spaceship-defender/protocol";

export interface UpgradeJournalEntry {
  readonly actionId: string;
  readonly fingerprint: string;
  readonly outcome: "accepted" | "invalid_phase" | "action_not_available" | "stale_action";
}

export function upgradeFingerprint(command: UpgradeVoteCommand): string {
  return [
    command.protocolVersion,
    command.roomId,
    command.playerId,
    command.runNumber,
    command.waveNumber,
    command.offerId,
    command.upgradeId,
    command.revision
  ].join("\u001f");
}

export function upgradeErrorMessage(
  outcome: Exclude<UpgradeJournalEntry["outcome"], "accepted">
): string {
  if (outcome === "invalid_phase") return "Upgrade vote requires an intermission.";
  if (outcome === "stale_action") return "A newer vote revision already exists for this role.";
  return "Upgrade offer is no longer available.";
}
