import { formatMaintenanceCountdown } from "@spaceship-defender/client-shared";

export interface MaintenanceNoticeProps {
  active: boolean;
  secondsRemaining: number;
}

/**
 * The announced maintenance window, on the screen the crew looks at together.
 *
 * Always shown while a window is announced, in every phase: this is where the
 * crew decides whether to start another run, and that decision is exactly what
 * the announcement is about.
 */
export function MaintenanceNotice({ active, secondsRemaining }: MaintenanceNoticeProps) {
  if (!active) return null;
  return (
    <p className="maintenance-notice" role="status" data-testid="maintenance-notice">
      {formatMaintenanceCountdown(secondsRemaining)}
    </p>
  );
}
