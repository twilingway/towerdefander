import { useEffect, useRef, useState } from "react";

import {
  calculateVisibleDemoRate,
  hasVisibleDemoBridge,
  parseVisibleDemoStatus,
  sendVisibleDemoCommand,
  visibleDemoStatusEvent,
  type VisibleDemoCommand,
  type VisibleDemoStatus
} from "./visibleDemo.js";

interface VisibleDemoOverlayProps {
  readonly connectionStatus: string;
  readonly phase: string;
  readonly waveNumber: number | undefined;
  readonly snapshotTick: number | undefined;
}

const offlineStatus: VisibleDemoStatus = {
  state: "offline",
  message: "Ожидаем подключение сценария автоматизации",
  waveNumber: 0,
  phase: "offline",
  controlHz: 0
};

export function VisibleDemoOverlay({
  connectionStatus,
  phase,
  waveNumber,
  snapshotTick
}: VisibleDemoOverlayProps) {
  const [automationStatus, setAutomationStatus] = useState<VisibleDemoStatus>(offlineStatus);
  const [renderDiagnostics, setRenderDiagnostics] = useState({ renderFps: 0, snapshotHz: 0 });
  const diagnostics = useRef({ startedAt: 0, frames: 0, snapshots: 0 });
  const bridgeAvailable = typeof window !== "undefined" && hasVisibleDemoBridge(window);

  useEffect(() => {
    function handleStatus(event: Event): void {
      const next = parseVisibleDemoStatus((event as CustomEvent<unknown>).detail);
      if (next !== undefined) setAutomationStatus(next);
    }

    window.addEventListener(visibleDemoStatusEvent, handleStatus);
    return () => {
      window.removeEventListener(visibleDemoStatusEvent, handleStatus);
    };
  }, []);

  useEffect(() => {
    diagnostics.current.snapshots += 1;
  }, [snapshotTick]);

  useEffect(() => {
    diagnostics.current = { startedAt: performance.now(), frames: 0, snapshots: 0 };
    let frameRequest = 0;
    const measureFrame = (now: number): void => {
      const current = diagnostics.current;
      current.frames += 1;
      const elapsedMs = now - current.startedAt;
      if (elapsedMs >= 1_000) {
        setRenderDiagnostics({
          renderFps: calculateVisibleDemoRate(current.frames, elapsedMs),
          snapshotHz: calculateVisibleDemoRate(current.snapshots, elapsedMs)
        });
        diagnostics.current = { startedAt: now, frames: 0, snapshots: 0 };
      }
      frameRequest = requestAnimationFrame(measureFrame);
    };
    frameRequest = requestAnimationFrame(measureFrame);
    return () => {
      cancelAnimationFrame(frameRequest);
    };
  }, []);

  function send(command: VisibleDemoCommand): void {
    sendVisibleDemoCommand(window, command);
  }

  const waitingForAutomation = automationStatus.phase === "offline";
  const displayedPhase = waitingForAutomation ? phase : automationStatus.phase;
  const displayedWave = waitingForAutomation ? waveNumber : automationStatus.waveNumber;

  return (
    <aside
      className="visible-demo-overlay"
      data-testid="visible-demo-overlay"
      data-render-fps={renderDiagnostics.renderFps}
      data-snapshot-hz={renderDiagnostics.snapshotHz}
      data-control-hz={automationStatus.controlHz}
      aria-live="polite"
    >
      <div className="visible-demo-overlay__heading">
        <span>Visible demo</span>
        <strong data-demo-state={automationStatus.state}>{automationStatus.state}</strong>
      </div>
      <dl>
        <div>
          <dt>Соединение</dt>
          <dd>{connectionStatus}</dd>
        </div>
        <div>
          <dt>Фаза</dt>
          <dd>{displayedPhase}</dd>
        </div>
        <div>
          <dt>Волна</dt>
          <dd>{displayedWave === undefined || displayedWave === 0 ? "—" : displayedWave}</dd>
        </div>
      </dl>
      <dl className="visible-demo-overlay__diagnostics" aria-label="Demo performance">
        <div>
          <dt>Render</dt>
          <dd data-testid="visible-demo-render-fps">{renderDiagnostics.renderFps} FPS</dd>
        </div>
        <div>
          <dt>Snapshots</dt>
          <dd data-testid="visible-demo-snapshot-hz">{renderDiagnostics.snapshotHz} Hz</dd>
        </div>
        <div>
          <dt>Controls</dt>
          <dd data-testid="visible-demo-control-hz">{automationStatus.controlHz} Hz</dd>
        </div>
      </dl>
      <p>{automationStatus.message}</p>
      <small>Пауза останавливает автопилот; серверная симуляция продолжает работать.</small>
      <div className="visible-demo-overlay__actions">
        <button
          type="button"
          onClick={() => {
            send("pause");
          }}
          disabled={!bridgeAvailable}
        >
          Пауза автопилота
        </button>
        <button
          type="button"
          onClick={() => {
            send("resume");
          }}
          disabled={!bridgeAvailable}
        >
          Продолжить
        </button>
        <button
          type="button"
          className="visible-demo-overlay__stop"
          onClick={() => {
            send("stop");
          }}
          disabled={!bridgeAvailable}
        >
          Stop
        </button>
      </div>
    </aside>
  );
}
