import { Client, type Room } from "@colyseus/sdk";
import {
  CAMERA_VIEW_ASPECT,
  CAMERA_VIEW_WIDTH_MAX,
  CAMERA_VIEW_WIDTH_MIN,
  MAX_START_WAVE,
  PROTOCOL_VERSION,
  ROOM_REFUSED_AT_CAPACITY,
  ROOM_TYPE,
  clientMessage,
  roomClosingSchema,
  serverLatencyProbeSchema,
  serverMessage,
  type CrewSize,
  type DisplayRoomView,
  type PublicShipCatalogue
} from "@spaceship-defender/protocol";
import {
  createDefaultGameServerUrl,
  formatLatency,
  isPreviewMode,
  PreviewPhaseButtons,
  PreviewShell,
  readStringEnvironment,
  roleLabel,
  type PreviewPhase
} from "@spaceship-defender/client-shared";
import { useEffect, useMemo, useRef, useState } from "react";

import { CombatRadar } from "./CombatRadar.js";
import { CrewLatency } from "./components/CrewLatency/index.js";
import { LobbyLayout } from "./components/LobbyLayout/index.js";
import { encounterLabel } from "./model/labels.js";
import { CreateRoomScreen } from "./screens/CreateRoomScreen/index.js";
import { getCurrentWaveUpgrade } from "./combatHudViewModel.js";
import { WeaponHeat } from "./WeaponHeat.js";
import { SpaceshipCanvas } from "./SpaceshipCanvas.js";
import { TeamUpgradeOverlay } from "./TeamUpgradeOverlay.js";
import { VisibleDemoOverlay } from "./VisibleDemoOverlay.js";
import { SalvageCountdown } from "./SalvageCountdown.js";
import { WaveCountdown } from "./WaveCountdown.js";
import { RunResultOverlay } from "./RunResultOverlay.js";
import {
  closeDisplayRoom,
  confirmDisplayRoomClose,
  roomClosingMessage
} from "./displayRoomLifecycle.js";
import {
  createPreviewRoomView,
  PREVIEW_CAMERA_VIEW_WIDTH,
  PREVIEW_ENDLESS_TIER,
  PREVIEW_MODULE_TIERS
} from "./previewMode.js";
import { ModuleTreeWindow } from "./components/ModuleTreeWindow/index.js";
import { createControllerJoinUrl, toDisplayRoomView, type NetworkRoomState } from "./roomView.js";
import { fetchShipCatalogue } from "./shipCatalogue.js";
import { isVisibleDemoMode, readShipArchetypeId, readStartWave } from "./visibleDemo.js";

type DisplayRoom = Room<unknown, NetworkRoomState>;
type ConnectionStatus = "idle" | "connecting" | "connected" | "reconnecting" | "error";

const gameServerUrl = readStringEnvironment(
  import.meta.env.VITE_GAME_SERVER_URL,
  createDefaultGameServerUrl()
);
const controllerUrl = readStringEnvironment(
  import.meta.env.VITE_CONTROLLER_URL,
  createDefaultControllerUrl()
);

export function DisplayApp() {
  const visibleDemo = isVisibleDemoMode(
    typeof window === "undefined" ? "" : window.location.search,
    import.meta.env.DEV,
    import.meta.env.VITE_VISIBLE_DEMO
  );
  // Development builds only. The server refuses the wave without its own flag,
  // so this control never promises more than the server will do.
  const allowStartWave = import.meta.env.DEV;
  const initialStartWave = allowStartWave
    ? readStartWave(typeof window === "undefined" ? "" : window.location.search, MAX_START_WAVE)
    : 1;
  // Lets a demo or a bookmark open the run on a named hull; the picker below
  // still wins when someone touches it.
  const urlShipArchetypeId = readShipArchetypeId(
    typeof window === "undefined" ? "" : window.location.search
  );
  const preview = isPreviewMode(
    typeof window === "undefined" ? "" : window.location.search,
    import.meta.env.DEV
  );
  const roomReference = useRef<DisplayRoom | undefined>(undefined);
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [networkView, setNetworkView] = useState<DisplayRoomView>();
  const [error, setError] = useState("");
  const [connectionEpoch, setConnectionEpoch] = useState(0);
  const [closingRoom, setClosingRoom] = useState(false);
  const [previewPhase, setPreviewPhase] = useState<PreviewPhase>("combat");
  const [previewCameraViewWidth, setPreviewCameraViewWidth] = useState(PREVIEW_CAMERA_VIEW_WIDTH);
  const [shipCatalogue, setShipCatalogue] = useState<PublicShipCatalogue | undefined>(undefined);
  // Layout preview feeds the same view the network fills, so the HUD, overlays
  // and the Phaser frame all render through the production path.
  const previewView = useMemo(
    () => (preview ? createPreviewRoomView(previewPhase, previewCameraViewWidth) : undefined),
    [preview, previewPhase, previewCameraViewWidth]
  );
  const view = previewView ?? networkView;
  const activeStatus: ConnectionStatus = previewView === undefined ? status : "connected";
  const joinUrl = useMemo(
    () => (view === undefined ? "" : createControllerJoinUrl(controllerUrl, view.roomId)),
    [view]
  );

  // The hulls a room can be opened on. Fetched once, and only informative: a
  // display that cannot reach the route still creates rooms, on the preset's
  // own default hull.
  useEffect(() => {
    const controller = new AbortController();
    void fetchShipCatalogue(gameServerUrl, controller.signal).then((catalogue) => {
      if (!controller.signal.aborted) setShipCatalogue(catalogue);
    });
    return () => {
      controller.abort();
    };
  }, []);

  useEffect(
    () => () => {
      const room = roomReference.current;
      roomReference.current = undefined;
      if (room !== undefined) {
        room.reconnection.enabled = false;
        void room.leave(false);
      }
    },
    []
  );

  async function createRoom(
    crewSize: CrewSize,
    shipArchetypeId: string | undefined,
    startWave: number
  ): Promise<void> {
    setStatus("connecting");
    setError("");
    setClosingRoom(false);
    try {
      const room = await new Client(gameServerUrl).create<NetworkRoomState>(ROOM_TYPE, {
        role: "display",
        protocolVersion: PROTOCOL_VERSION,
        crewSize,
        // Absent means the preset's own hull, so a display that could not reach
        // the catalogue still opens a room.
        ...(shipArchetypeId === undefined ? {} : { shipArchetypeId }),
        // Sent only when a tester asked for one, so an ordinary create carries
        // exactly what it always did.
        ...(startWave > 1 ? { startWave } : {})
      });
      roomReference.current = room;
      room.onStateChange((state) => {
        if (roomReference.current === room) applyRoomState(state);
      });
      applyRoomState(room.state);
      room.onMessage(serverMessage.latencyProbe, (payload: unknown) => {
        const result = serverLatencyProbeSchema.safeParse(payload);
        if (!result.success) return;
        room.send(clientMessage.latencyPong, {
          protocolVersion: PROTOCOL_VERSION,
          roomId: room.roomId,
          probeId: result.data.probeId
        });
      });
      room.onMessage(serverMessage.roomClosing, (payload: unknown) => {
        const result = roomClosingSchema.safeParse(payload);
        if (!result.success || roomReference.current !== room) return;
        room.reconnection.enabled = false;
        roomReference.current = undefined;
        resetToCreate(roomClosingMessage(result.data.reason));
      });
      room.onDrop(() => {
        if (roomReference.current !== room) return;
        setStatus("reconnecting");
        setError("Связь прервана. Восстанавливаем общий экран…");
        setConnectionEpoch((value) => value + 1);
      });
      room.onReconnect(() => {
        if (roomReference.current !== room) return;
        setStatus("connected");
        setError("");
      });
      room.onError((_code, message) => {
        if (roomReference.current !== room) return;
        setStatus("error");
        setError(message ?? "Сервер сообщил об ошибке.");
      });
      room.onLeave(() => {
        if (roomReference.current !== room) return;
        roomReference.current = undefined;
        resetToCreate("Комната закрыта. Создайте новую сессию.");
      });
    } catch (reason) {
      setStatus("error");
      setError(createFailureMessage(reason));
    }
  }

  function applyRoomState(state: NetworkRoomState): void {
    const next = toDisplayRoomView(state);
    if (next !== undefined) {
      setNetworkView(next);
      setStatus("connected");
    }
  }

  function resetToCreate(message: string): void {
    setNetworkView(undefined);
    setStatus("idle");
    setError(message);
    setConnectionEpoch(0);
    setClosingRoom(false);
  }

  async function handleCloseRoom(): Promise<void> {
    const room = roomReference.current;
    if (room === undefined || !confirmDisplayRoomClose((message) => window.confirm(message))) {
      return;
    }

    setClosingRoom(true);
    roomReference.current = undefined;
    try {
      await closeDisplayRoom(room);
      resetToCreate("Комната закрыта общим экраном.");
    } catch {
      resetToCreate("Не удалось подтвердить закрытие комнаты. Создайте новую сессию.");
    }
  }

  if ((activeStatus !== "connected" && activeStatus !== "reconnecting") || view === undefined) {
    return (
      <CreateRoomScreen
        status={status}
        error={error}
        visibleDemo={visibleDemo}
        allowStartWave={allowStartWave}
        initialStartWave={initialStartWave}
        ships={shipCatalogue?.ships ?? []}
        defaultShipId={urlShipArchetypeId ?? shipCatalogue?.defaultShipId}
        onCreate={(crewSize, shipArchetypeId, startWave) =>
          void createRoom(crewSize, shipArchetypeId, startWave)
        }
      />
    );
  }

  const waveUpgrade =
    view.game === null
      ? null
      : getCurrentWaveUpgrade(view.game.teamUpgrade.selection, view.game.encounter.waveNumber);
  // Only the rocks that came with the wave pay credits, so those are the ones
  // worth counting next to the score.
  const waveAsteroidCount =
    view.game?.asteroids.filter(({ origin }) => origin === "wave").length ?? 0;

  return (
    <main className={`display-shell ${view.game === null ? "" : "display-shell--battle"}`}>
      {previewView !== undefined && (
        <PreviewControls
          phase={previewPhase}
          onPhaseChange={setPreviewPhase}
          cameraViewWidth={previewCameraViewWidth}
          onCameraViewWidthChange={setPreviewCameraViewWidth}
        />
      )}
      <header className="room-header">
        <div>
          <p className="eyebrow">Комната</p>
          <strong className="room-code">{view.roomId}</strong>
        </div>
        <div className="room-network">
          <div className={`phase-badge phase-badge--${view.phase}`}>
            {view.phase === "active" ? "Корабль в бою" : "Собираем экипаж"}
          </div>
          <span className="latency-indicator" aria-live="polite">
            Экран → сервер {formatLatency(view.displayLatencyMs)}
          </span>
          <button
            type="button"
            className="room-close-button"
            onClick={() => void handleCloseRoom()}
            disabled={closingRoom}
          >
            {closingRoom ? "Закрываем комнату…" : "Закрыть комнату"}
          </button>
        </div>
      </header>
      {error.length > 0 && <p className="error-message">{error}</p>}

      <LobbyLayout view={view} joinUrl={joinUrl} />

      {view.game === null ? (
        <section id="game-canvas" className="game-stage game-stage--waiting">
          <span>Полёт начнётся, когда pilot, gunner и shield нажмут «Готов»</span>
        </section>
      ) : (
        <section id="game-canvas" className="game-stage" aria-label="Космическое поле боя">
          <header className="battle-header spaceship-hud">
            <div>
              <span>Волна</span>
              <strong>{view.game.encounter.waveNumber}</strong>
              <small>{encounterLabel(view.game.encounter.phase)}</small>
            </div>
            {/* Hull and shield moved onto the radar dial: two rings, their end
                labels and the shield state word say everything these two cards
                did, in the place the pilot is already looking. */}
            <div>
              <span>Счёт</span>
              <strong>{view.game.encounter.score}</strong>
              <small data-testid="hud-field-counts">
                Враги {view.game.enemyShips.length} · Ракеты {view.game.homingMissiles.length} ·
                Камни {waveAsteroidCount}
              </small>
            </div>
            <div>
              <span>Кредиты</span>
              <strong>{view.game.credits}</strong>
              <small>
                {waveUpgrade === null
                  ? "в этой волне улучшений нет"
                  : `улучшение волны: ${roleLabel(waveUpgrade.role)}`}
              </small>
            </div>
            <WeaponHeat cannon={view.game.cannon} machineGun={view.game.machineGun} />
          </header>
          <SpaceshipCanvas
            game={view.game}
            runNumber={view.runNumber}
            connectionEpoch={connectionEpoch}
            visibleDemo={visibleDemo}
          />
          {view.game.encounter.phase === "combat" &&
            (view.game.encounter.lootWindowSecondsRemaining > 0 ? (
              <SalvageCountdown secondsRemaining={view.game.encounter.lootWindowSecondsRemaining} />
            ) : (
              <WaveCountdown
                className="display-wave-countdown"
                secondsRemaining={view.game.encounter.waveSecondsRemaining}
              />
            ))}
          <CombatRadar game={view.game} />
          {view.game.encounter.phase === "intermission" && (
            <TeamUpgradeOverlay
              teamUpgrade={view.game.teamUpgrade}
              credits={view.game.credits}
              score={view.game.encounter.score}
              waveNumber={view.game.encounter.waveNumber}
              phaseTicksRemaining={view.game.encounter.phaseTicksRemaining}
              purchasedModules={view.game.purchasedModules}
            />
          )}
          {view.game.encounter.phase === "result" && view.game.encounter.outcome !== null && (
            <RunResultOverlay
              outcome={view.game.encounter.outcome}
              defeatReason={view.game.encounter.defeatReason}
              waveNumber={view.game.encounter.waveNumber}
              score={view.game.encounter.score}
              readyCount={view.players.filter(({ ready }) => ready).length}
              closing={closingRoom}
              onClose={() => void handleCloseRoom()}
            />
          )}
          {/* Preview only until the tree reaches the display in a real run:
              the catalogue does not carry it yet. */}
          {previewView !== undefined && (
            <ModuleTreeWindow
              tiers={PREVIEW_MODULE_TIERS}
              endlessTier={PREVIEW_ENDLESS_TIER}
              purchased={view.game.purchasedModules}
              ship={{
                maxHp: view.game.spaceship.maxHp,
                shieldCapacity: view.game.shield.capacity,
                shieldArcRadians: view.game.shield.arcHalfAngle * 2,
                shieldRadius: view.game.shieldRadius
              }}
            />
          )}
          <CrewLatency view={view} game={view.game} />
        </section>
      )}
      {visibleDemo ? (
        <VisibleDemoOverlay
          connectionStatus={status}
          phase={view.game?.encounter.phase ?? view.phase}
          waveNumber={view.game?.encounter.waveNumber}
          snapshotTick={view.game?.tick}
        />
      ) : null}
    </main>
  );
}

export function PreviewControls({
  phase,
  onPhaseChange,
  cameraViewWidth,
  onCameraViewWidthChange
}: {
  readonly phase: PreviewPhase;
  readonly onPhaseChange: (phase: PreviewPhase) => void;
  readonly cameraViewWidth: number;
  readonly onCameraViewWidthChange: (cameraViewWidth: number) => void;
}) {
  return (
    <PreviewShell>
      <PreviewPhaseButtons phase={phase} onPhaseChange={onPhaseChange} />
      <label className="preview-controls__camera">
        <span>
          Кадр камеры {cameraViewWidth} × {Math.round(cameraViewWidth * CAMERA_VIEW_ASPECT)}
        </span>
        <input
          type="range"
          min={CAMERA_VIEW_WIDTH_MIN}
          max={CAMERA_VIEW_WIDTH_MAX}
          step={50}
          value={cameraViewWidth}
          data-testid="preview-camera-view-width"
          onChange={(event) => {
            onCameraViewWidthChange(Number(event.target.value));
          }}
        />
      </label>
    </PreviewShell>
  );
}

function createFailureMessage(reason: unknown): string {
  if (!(reason instanceof Error)) return "Не удалось создать комнату.";
  if (reason.message === ROOM_REFUSED_AT_CAPACITY) {
    return "Сервер занят: свободных комнат нет. Попробуйте через минуту.";
  }
  if (reason.message === "protocol_mismatch") {
    return "Версия игры устарела. Обновите страницу.";
  }
  return reason.message;
}

function createDefaultControllerUrl(): string {
  if (typeof window === "undefined") return "http://localhost:5174";
  return `${window.location.protocol}//${window.location.hostname}:5174`;
}
