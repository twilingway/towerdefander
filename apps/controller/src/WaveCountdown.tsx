interface WaveCountdownProps {
  readonly secondsRemaining: number;
}

export function WaveCountdown({ secondsRemaining }: WaveCountdownProps) {
  const warning = secondsRemaining <= 60;
  return (
    <div
      className={`wave-countdown${warning ? " wave-countdown--warning" : ""}`}
      role="timer"
      aria-label={`До конца волны ${formatWaveCountdown(secondsRemaining)}`}
    >
      <span>До конца волны</span>
      <strong>{formatWaveCountdown(secondsRemaining)}</strong>
    </div>
  );
}

export function formatWaveCountdown(secondsRemaining: number): string {
  const wholeSeconds = Math.max(0, Math.floor(secondsRemaining));
  const minutes = Math.floor(wholeSeconds / 60);
  const seconds = wholeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
