import type { TrafficMeter } from "../../model/trafficMeter.js";

/**
 * The instruments the smoothness work is judged by, in one place.
 *
 * Deliberately not part of the ordinary HUD: it is asked for, it is read, and it
 * goes away. The frame numbers on it are the ones the HUD already shows, so the
 * panel adds only what the shared screen has no reason to carry.
 */

/** Kilobytes once there are kilobytes; a four-digit byte count reads as noise. */
export function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "—";
  if (value < 1024) return `${String(Math.round(value))} Б`;
  return `${(value / 1024).toFixed(1)} КБ`;
}

/** Tenths of a millisecond are the whole signal here; whole numbers hide it. */
export function formatStepMs(value: number): string {
  return Number.isFinite(value) && value > 0 ? `${value.toFixed(2)} мс` : "—";
}

export function formatPing(value: number | null): string {
  return value === null || value < 0 ? "—" : `${String(Math.round(value))} мс`;
}

export function DiagnosticsPanel({
  fps,
  worstFrameMs,
  stutterShare,
  serverStepMs,
  pingMs,
  entityCount,
  traffic,
  predictionEnabled,
  onTogglePrediction,
  backgroundEnabled,
  onToggleBackground
}: {
  readonly fps: number;
  readonly worstFrameMs: number;
  readonly stutterShare: number;
  readonly serverStepMs: number;
  readonly pingMs: number | null;
  readonly entityCount: number;
  /** Undefined means the counter never got hold of the socket. */
  readonly traffic: TrafficMeter | undefined;
  readonly predictionEnabled: boolean;
  readonly onTogglePrediction: () => void;
  readonly backgroundEnabled: boolean;
  readonly onToggleBackground: () => void;
}) {
  return (
    <aside className="diagnostics-panel" data-testid="diagnostics-panel">
      <dl>
        <div>
          <dt>Кадр</dt>
          <dd data-testid="diagnostics-frame">
            {Number.isFinite(fps) && fps > 0 ? Math.round(fps) : "—"} к/с · худший{" "}
            {Number.isFinite(worstFrameMs) ? Math.round(worstFrameMs) : 0} мс · рывки{" "}
            {Math.round(stutterShare * 100)}%
          </dd>
        </div>
        <div>
          <dt>Шаг сервера</dt>
          <dd data-testid="diagnostics-step">{formatStepMs(serverStepMs)}</dd>
        </div>
        <div>
          <dt>До сервера</dt>
          <dd data-testid="diagnostics-ping">{formatPing(pingMs)}</dd>
        </div>
        <div>
          <dt>Сущностей</dt>
          <dd data-testid="diagnostics-entities">{entityCount}</dd>
        </div>
        <div>
          <dt>Трафик</dt>
          <dd data-testid="diagnostics-traffic">
            {traffic === undefined ? (
              // An instrument that could not measure has to say so: a confident
              // zero here is indistinguishable from a silent connection.
              "счётчик не зацепился"
            ) : (
              <>
                ↓ {formatBytes(traffic.inPerSecond)}/с · ↑ {formatBytes(traffic.outPerSecond)}/с
                <br />
                за сеанс ↓ {formatBytes(traffic.totalIn)} · ↑ {formatBytes(traffic.totalOut)}
              </>
            )}
          </dd>
        </div>
      </dl>
      <button
        type="button"
        className="diagnostics-panel__toggle"
        data-testid="diagnostics-prediction-toggle"
        data-prediction={predictionEnabled ? "on" : "off"}
        onClick={onTogglePrediction}
      >
        Предсказание: {predictionEnabled ? "вкл" : "выкл"}
      </button>
      <button
        type="button"
        className="diagnostics-panel__toggle"
        data-testid="diagnostics-background-toggle"
        data-background={backgroundEnabled ? "on" : "off"}
        onClick={onToggleBackground}
      >
        Фон: {backgroundEnabled ? "вкл" : "выкл"}
      </button>
    </aside>
  );
}
