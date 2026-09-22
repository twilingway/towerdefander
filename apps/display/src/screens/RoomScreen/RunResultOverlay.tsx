import type { CrewSize, DefeatReason, TerminalOutcome } from "@spaceship-defender/protocol";

interface RunResultOverlayProps {
  readonly outcome: TerminalOutcome;
  readonly defeatReason: DefeatReason | null;
  readonly waveNumber: number;
  readonly score: number;
  readonly readyCount: number;
  /** How many seats there are to be ready. It was written as three. */
  readonly crewSize: CrewSize;
  readonly closing: boolean;
  readonly onClose: () => void;
  /**
   * What leaving is called here. A run hosted by this page has no room to
   * close, and telling its player they are closing one - for whom? - is the
   * networked wording leaking into a mode that has no network.
   */
  readonly closeLabel?: { readonly idle: string; readonly busy: string };
  /**
   * Present when this screen is also the pilot. Rematch is a controller
   * gesture, and a cockpit is not one, so without this the only way out of a
   * finished solo run was to close the room.
   */
  readonly cockpit?: {
    readonly ready: boolean;
    readonly onReady: () => void;
  };
}

export function RunResultOverlay({
  outcome,
  defeatReason,
  waveNumber,
  score,
  readyCount,
  crewSize,
  closing,
  onClose,
  closeLabel = { idle: "Закрыть комнату", busy: "Закрываем комнату…" },
  cockpit
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
        Готовы сыграть ещё: {readyCount}/{crewSize}
      </p>
      <p>{rematchHint(crewSize)}</p>
      {cockpit !== undefined && (
        <button
          type="button"
          className="cockpit-ready"
          data-testid="cockpit-rematch"
          onClick={cockpit.onReady}
          disabled={cockpit.ready}
        >
          {cockpit.ready ? "Ждём старта…" : "Играть ещё"}
        </button>
      )}
      <button type="button" className="room-close-button" onClick={onClose} disabled={closing}>
        {closing ? closeLabel.busy : closeLabel.idle}
      </button>
    </div>
  );
}

function rematchHint(crewSize: CrewSize): string {
  if (crewSize === 1) return "Новый забег начнётся, как только вы подтвердите готовность.";
  return crewSize === 2
    ? "Новый забег начнётся автоматически, когда оба игрока подтвердят готовность."
    : "Новый забег начнётся автоматически, когда все три игрока подтвердят готовность.";
}

function resultTitle(outcome: TerminalOutcome, defeatReason: DefeatReason | null): string {
  if (outcome === "victory") return "Победа!";
  return defeatReason === "wave_timeout" ? "Время волны истекло" : "Корабль уничтожен";
}
