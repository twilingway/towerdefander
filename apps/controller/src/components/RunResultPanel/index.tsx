import type { DefeatReason, PublicPlayerView, TerminalOutcome } from "@spaceship-defender/protocol";

export function RunResultPanel({
  outcome,
  defeatReason,
  waveNumber,
  score,
  players,
  currentPlayer,
  reconnecting,
  onRematch
}: {
  readonly outcome: TerminalOutcome;
  readonly defeatReason: DefeatReason | null;
  readonly waveNumber: number;
  readonly score: number;
  readonly players: readonly PublicPlayerView[];
  readonly currentPlayer: PublicPlayerView;
  readonly reconnecting: boolean;
  readonly onRematch: () => void;
}) {
  const readyCount = players.filter((player) => player.ready).length;
  const victory = outcome === "victory";
  return (
    <div className={`result-panel result-panel--${outcome}`} role="status">
      <p className="eyebrow">Забег завершён</p>
      <h2>
        {victory
          ? "Победа экипажа"
          : defeatReason === "wave_timeout"
            ? "Время волны истекло"
            : "Корабль уничтожен"}
      </h2>
      <strong>Волна {waveNumber}</strong>
      <span>Счёт: {score}</span>
      <span className="rematch-readiness">Готовы к новому бою: {readyCount} / 3</span>
      <button type="button" disabled={currentPlayer.ready || reconnecting} onClick={onRematch}>
        {currentPlayer.ready ? "Готов — ждём экипаж" : "Играть ещё"}
      </button>
      <small>Новый бой начнётся в этой же комнате, когда будут готовы все три роли.</small>
    </div>
  );
}
