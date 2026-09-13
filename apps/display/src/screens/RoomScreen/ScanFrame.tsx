import { formatScanClock } from "./ArenaHud.js";

/**
 * The match's sweep under the frame skin: a button of its own beside the dial it
 * fills with marks, at the dial's height.
 *
 * It says what it costs while it cools rather than going dead, because the wait
 * is the decision - a pilot times the next sweep against the zone closing.
 */
export function ScanFrame({
  readySeconds,
  revealSecondsRemaining,
  onScan
}: {
  readonly readySeconds: number;
  readonly revealSecondsRemaining: number;
  readonly onScan: () => void;
}) {
  return (
    <button
      type="button"
      className={`frame-scan${readySeconds > 0 ? " is-cooling" : ""}`}
      data-testid="arena-scan"
      onClick={onScan}
      disabled={readySeconds > 0}
    >
      <span>Скан</span>
      <small>{formatScanClock(readySeconds, revealSecondsRemaining)}</small>
    </button>
  );
}
