export type TimerFrameTone = "wave" | "warning" | "salvage";

/** The last minute of a wave is the one the clock warns about. */
export const WAVE_WARNING_SECONDS = 60;

export function formatWaveCountdown(secondsRemaining: number): string {
  const wholeSeconds = Math.max(0, Math.floor(secondsRemaining));
  const minutes = Math.floor(wholeSeconds / 60);
  const seconds = wholeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/**
 * The example's timer frame: the time in its ring and the words under it.
 *
 * The words stay on screen rather than only in the label a screen reader gets:
 * the loot window has to be told apart from the wave clock by more than colour.
 * A match has no wave to name, so its clock comes without words.
 */
export function TimerFrame({
  value,
  caption,
  ariaLabel,
  tone,
  frameUrl
}: {
  readonly value: string;
  readonly caption: string | undefined;
  readonly ariaLabel: string;
  readonly tone: TimerFrameTone;
  readonly frameUrl: string | undefined;
}) {
  return (
    <div
      className={`timer-frame timer-frame--${tone}`}
      role="timer"
      aria-label={ariaLabel}
      data-testid="timer-frame"
    >
      {frameUrl !== undefined && <img className="timer-frame__art" src={frameUrl} alt="" />}
      <strong className="timer-frame__value">{value}</strong>
      {caption !== undefined && <span className="timer-frame__caption">{caption}</span>}
    </div>
  );
}
