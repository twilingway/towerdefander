import type { DefeatReason, TerminalOutcome } from "@spaceship-defender/protocol";

interface RunResultOverlayProps {
  readonly outcome: TerminalOutcome;
  readonly defeatReason: DefeatReason | null;
  readonly waveNumber: number;
  readonly score: number;
  readonly readyCount: number;
  readonly closing: boolean;
  readonly onClose: () => void;
}

export function RunResultOverlay({
  outcome,
  defeatReason,
  waveNumber,
  score,
  readyCount,
  closing,
  onClose
}: RunResultOverlayProps) {
  return (
    <div
      className={`encounter-overlay encounter-overlay--result encounter-overlay--${outcome}`}
      role="status"
    >
      <p className="eyebrow">Забег завершён</p>
      <h2>{resultTitle(outcome, defeatReason)}</h2>
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

function resultTitle(outcome: TerminalOutcome, defeatReason: DefeatReason | null): string {
  if (outcome === "victory") return "Победа!";
  return defeatReason === "wave_timeout" ? "Время волны истекло" : "Корабль уничтожен";
}
