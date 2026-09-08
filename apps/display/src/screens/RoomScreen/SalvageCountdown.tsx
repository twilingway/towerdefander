interface SalvageCountdownProps {
  readonly secondsRemaining: number;
}

/**
 * The wave is already won and the crew is being given seconds to fly to what
 * the last kill dropped. It replaces the wave clock rather than joining it:
 * from here the wave ends when this reaches zero, whatever the wave deadline
 * says.
 */
export function SalvageCountdown({ secondsRemaining }: SalvageCountdownProps) {
  const seconds = Math.max(0, Math.ceil(secondsRemaining));
  return (
    <div
      className="wave-countdown wave-countdown--salvage display-wave-countdown"
      role="timer"
      aria-label={`Сбор трофеев ${String(seconds)} с`}
    >
      <span>Сбор трофеев</span>
      <strong>{seconds}</strong>
    </div>
  );
}
