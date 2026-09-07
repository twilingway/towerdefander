import type { ComponentCost } from "../../model/componentCost.js";
import type { WorkMeter } from "../../model/workMeter.js";
import type { LongTaskMeter } from "../../model/longTasks.js";
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
  averageFrameMs,
  longTasks,
  tickHz,
  patchHz,
  worstFrameMs,
  stutterShare,
  sceneMsPerSecond,
  worstSceneMs,
  serverStepMs,
  pingMs,
  entityCount,
  liveDrawn,
  offscreen,
  playbackDelayMs,
  patchIntervalMs,
  traffic,
  snapshot,
  commit,
  components,
  pendingInput,
  drift,
  predictionEnabled,
  onTogglePrediction,
  backgroundEnabled,
  onToggleBackground,
  glowEnabled,
  onToggleGlow,
  vectorsEnabled,
  interfaceEnabled,
  onToggleInterface,
  opaquePanels,
  onToggleOpaquePanels,
  onToggleVectors
}: {
  readonly fps: number;
  /** The mean frame of the last second, beside the worst one. */
  readonly averageFrameMs: number;
  /**
   * Script that held the page for fifty milliseconds or more.
   *
   * The last line of the ledger: a long frame with no long task behind it was
   * spent painting, not running, and nothing in this list can be made cheaper
   * to fix it.
   */
  readonly longTasks: LongTaskMeter | undefined;
  readonly tickHz: number;
  readonly patchHz: number;
  readonly worstFrameMs: number;
  readonly stutterShare: number;
  /** What the Phaser scene's own per-frame work costs, over the last second. */
  readonly sceneMsPerSecond: number;
  readonly worstSceneMs: number;
  readonly serverStepMs: number;
  readonly pingMs: number | null;
  readonly entityCount: number;
  /**
   * How many of them the scene drew off the predictor.
   *
   * Zero next to a full field means the world is still being drawn from
   * snapshots while the ship is drawn from the local step - the two clocks that
   * put a shell where the hull used to be.
   */
  readonly liveDrawn: number;
  /** How many of them the camera does not show - what an area filter would drop. */
  readonly offscreen: number;
  /** How far behind the room the world is drawn - the interpolation buffer. */
  readonly playbackDelayMs: number;
  /** The measured spacing between snapshots the buffer was sized from. */
  readonly patchIntervalMs: number;
  /** Undefined means the counter never got hold of the socket. */
  readonly traffic: TrafficMeter | undefined;
  /** What turning patches into views costs the main thread. */
  readonly snapshot: WorkMeter | undefined;
  /** What React spends committing that view, from its own profiler. */
  readonly commit: WorkMeter | undefined;
  /**
   * The same second, split by panel, dearest first.
   *
   * The line above says React cost six milliseconds; this says whether that was
   * eight panels each costing nothing, or one panel worth rewriting.
   */
  readonly components: readonly ComponentCost[];
  /** Frames sent that the room has not acknowledged; a couple is healthy. */
  readonly pendingInput: number;
  /** Persistent disagreement between the predicted ship and the room's. */
  readonly drift: number;
  readonly predictionEnabled: boolean;
  readonly onTogglePrediction: () => void;
  readonly backgroundEnabled: boolean;
  readonly onToggleBackground: () => void;
  readonly glowEnabled: boolean;
  readonly onToggleGlow: () => void;
  readonly vectorsEnabled: boolean;
  readonly onToggleVectors: () => void;
  /** Everything React draws over the world, on or off. */
  readonly interfaceEnabled: boolean;
  readonly onToggleInterface: () => void;
  /** Panels the compositor draws over rather than through. */
  readonly opaquePanels: boolean;
  readonly onToggleOpaquePanels: () => void;
}) {
  return (
    <aside className="diagnostics-panel" data-testid="diagnostics-panel">
      <div className="diagnostics-panel__switches">
        <button
          type="button"
          className="diagnostics-panel__toggle"
          data-testid="diagnostics-panels-toggle"
          data-panels={opaquePanels ? "opaque" : "glass"}
          onClick={onToggleOpaquePanels}
        >
          Панели: {opaquePanels ? "плотные" : "стекло"}
        </button>
        <button
          type="button"
          className="diagnostics-panel__toggle"
          data-testid="diagnostics-interface-toggle"
          data-interface={interfaceEnabled ? "on" : "off"}
          onClick={onToggleInterface}
        >
          Интерфейс: {interfaceEnabled ? "вкл" : "выкл"}
        </button>
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
        <button
          type="button"
          className="diagnostics-panel__toggle"
          data-testid="diagnostics-glow-toggle"
          data-glow={glowEnabled ? "on" : "off"}
          onClick={onToggleGlow}
        >
          Свечение: {glowEnabled ? "вкл" : "выкл"}
        </button>
        <button
          type="button"
          className="diagnostics-panel__toggle"
          data-testid="diagnostics-vectors-toggle"
          data-vectors={vectorsEnabled ? "on" : "off"}
          onClick={onToggleVectors}
        >
          Векторы: {vectorsEnabled ? "вкл" : "выкл"}
        </button>
      </div>
      <dl>
        <div>
          <dt>Темп</dt>
          <dd data-testid="diagnostics-rates">
            тик {tickHz} Гц · патч {patchHz} Гц
          </dd>
        </div>
        <div>
          <dt>Блокировки</dt>
          <dd data-testid="diagnostics-longtasks">
            {longTasks?.supported !== true
              ? "браузер не считает"
              : `${longTasks.perSecond.toFixed(1)}/с · худшая ${longTasks.worstMs.toFixed(0)} мс`}
          </dd>
        </div>
        <div>
          <dt>Кадр</dt>
          <dd data-testid="diagnostics-frame">
            {Number.isFinite(fps) && fps > 0 ? Math.round(fps) : "—"} к/с · сред{" "}
            {averageFrameMs.toFixed(1)} мс · худший{" "}
            {Number.isFinite(worstFrameMs) ? Math.round(worstFrameMs) : 0} мс · рывки{" "}
            {Math.round(stutterShare * 100)}%
          </dd>
        </div>
        <div>
          <dt>Сцена</dt>
          <dd data-testid="diagnostics-scene">
            {`${sceneMsPerSecond.toFixed(0)} мс/с · худший ${worstSceneMs.toFixed(1)} мс`}
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
          <dt>Снимок → вид</dt>
          <dd data-testid="diagnostics-snapshot">
            {snapshot === undefined
              ? "—"
              : `${snapshot.msPerSecond.toFixed(0)} мс/с · ${snapshot.samplesPerSecond.toFixed(0)} патч/с · худший ${snapshot.worstMs.toFixed(1)} мс`}
          </dd>
        </div>
        <div>
          <dt>React</dt>
          <dd data-testid="diagnostics-commit">
            {commit === undefined
              ? "—"
              : `${commit.msPerSecond.toFixed(0)} мс/с · ${commit.samplesPerSecond.toFixed(0)} коммит/с · худший ${commit.worstMs.toFixed(1)} мс`}
          </dd>
        </div>
        {components.map((panel) => (
          <div key={panel.id} className="diagnostics-component">
            <dt>{panel.id}</dt>
            <dd>
              {panel.msPerSecond.toFixed(1)} мс/с · {panel.commits.toFixed(0)} к/с · худший{" "}
              {panel.worstMs.toFixed(2)} мс
            </dd>
          </div>
        ))}
        <div>
          <dt>Ввод в пути</dt>
          <dd data-testid="diagnostics-pending">
            {pendingInput} · расхождение {drift.toFixed(2)}
          </dd>
        </div>
        <div>
          <dt>Сущностей</dt>
          <dd data-testid="diagnostics-entities">
            {entityCount} · через предсказание {liveDrawn} · за кадром {offscreen}
            <br />
            буфер мира {playbackDelayMs} мс · снимок раз в {patchIntervalMs.toFixed(0)} мс
          </dd>
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
                исходящих {traffic.outMessagesPerSecond.toFixed(0)}/с
                <br />
                за сеанс ↓ {formatBytes(traffic.totalIn)} · ↑ {formatBytes(traffic.totalOut)}
              </>
            )}
          </dd>
        </div>
      </dl>
    </aside>
  );
}
