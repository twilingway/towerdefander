import { formatMaintenanceCountdown } from "@spaceship-defender/client-shared";

export interface MaintenanceNoticeProps {
  active: boolean;
  secondsRemaining: number;
  /**
   * Whether the announcement is the screen rather than a line on it. On the
   * create screen it replaces the controls -- none of them work while a window
   * is announced -- so it has to read as the answer, not as a footnote beside
   * three buttons that will only say no.
   */
  prominent?: boolean;
}

/**
 * The announced maintenance window, on the screen the crew looks at together.
 *
 * Always shown while a window is announced, in every phase: this is where the
 * crew decides whether to start another run, and that decision is exactly what
 * the announcement is about.
 */
export function MaintenanceNotice({ active, secondsRemaining, prominent }: MaintenanceNoticeProps) {
  if (!active) return null;
  return (
    <p
      className={
        prominent === true
          ? "maintenance-notice maintenance-notice--prominent"
          : "maintenance-notice"
      }
      role="status"
      data-testid="maintenance-notice"
    >
      {formatMaintenanceCountdown(secondsRemaining)}
    </p>
  );
}
