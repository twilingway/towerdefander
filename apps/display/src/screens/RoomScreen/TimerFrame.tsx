export type TimerFrameTone = "wave" | "warning" | "salvage";

/**
 * The example's timer frame: the time in its ring and the words under it.
 *
 * The words stay on screen rather than only in the label a screen reader gets:
 * the loot window has to be told apart from the wave clock by more than colour.
 */
export function TimerFrame({
  value,
  caption,
  ariaLabel,
  tone,
  frameUrl
}: {
  readonly value: string;
  readonly caption: string;
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
      <span className="timer-frame__caption">{caption}</span>
    </div>
  );
}
