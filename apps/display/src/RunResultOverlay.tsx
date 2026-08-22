import type { TerminalOutcome } from "@town-defenders/protocol";

interface RunResultOverlayProps {
  readonly outcome: TerminalOutcome;
  readonly waveNumber: number;
  readonly score: number;
  readonly readyCount: number;
  readonly closing: boolean;
  readonly onClose: () => void;
}

export function RunResultOverlay({
  outcome,
  waveNumber,
  score,
  readyCount,
  closing,
  onClose
}: RunResultOverlayProps) {
  const isVictory = outcome === "victory";
  return (
    <div
      className={`encounter-overlay encounter-overlay--result encounter-overlay--${outcome}`}
      role="status"
    >
      <p className="eyebrow">Забег завершён</p>
      <h2>{isVictory ? "Победа!" : "Летающий замок уничтожен"}</h2>
      <strong>Волна {waveNumber}</strong>
      <p>Итоговый счёт: {score}</p>
      <p className="rematch-readiness" aria-live="polite">
        Готовы сыграть ещё: {readyCount}/3
      </p>
      <p>Новый забег начнётся автоматически, когда все три игрока подтвердят готовность.</p>
      <button type="button" className="room-close-button" onClick={onClose} disabled={closing}>
        {closing ? "Закрываем комнату…" : "Закрыть комнату"}
      </button>
    </div>
  );
}
