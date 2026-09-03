import { formatMaintenanceCountdown } from "@spaceship-defender/client-shared";

/**
 * How little has to be left before the announcement is worth a player's
 * attention mid-fight. Above it the message is not an action -- there is
 * nothing a pilot can do about maintenance while a wave is on them, and the
 * panel's attention belongs to the stick. Below it the meaning changes to
 * "this wave is the last one", which is worth reading.
 */
export const MAINTENANCE_COMBAT_NOTICE_SECONDS = 5 * 60;

export interface MaintenanceNoticeProps {
  active: boolean;
  secondsRemaining: number;
  /** True while the player is flying; the panel stays clean until the end. */
  inCombat: boolean;
}

export function MaintenanceNotice({ active, secondsRemaining, inCombat }: MaintenanceNoticeProps) {
  if (!active) return null;
  if (inCombat && secondsRemaining > MAINTENANCE_COMBAT_NOTICE_SECONDS) return null;
  return (
    <p className="maintenance-notice" role="status" data-testid="maintenance-notice">
      {formatMaintenanceCountdown(secondsRemaining)}
    </p>
  );
}
