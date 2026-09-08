import {
  CAMERA_VIEW_ASPECT,
  CAMERA_VIEW_WIDTH_MAX,
  CAMERA_VIEW_WIDTH_MIN
} from "@spaceship-defender/protocol";
import {
  formatLatency,
  PreviewPhaseButtons,
  PreviewShell,
  type PreviewPhase
} from "@spaceship-defender/client-shared";
import {
  Profiler,
  useCallback,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode
} from "react";

import { PolledCombatRadar } from "./CombatRadar.js";
import { useLetterboxBars } from "./model/hooks/useLetterboxBars.js";
import { PolledFpsReadout } from "./components/FpsReadout/index.js";
import { LobbyLayout } from "./components/LobbyLayout/index.js";
import { CreateRoomScreen } from "./screens/CreateRoomScreen/index.js";
import { RotateNotice, useIsPortrait } from "./components/RotateNotice/index.js";
import { useSoloCockpit, type SoloCockpitControls } from "./model/hooks/useSoloCockpit.js";
import { useBareControls } from "./model/hooks/useBareControls.js";
import { useCockpitKeyboard } from "./model/hooks/useCockpitKeyboard.js";
import { readAimAssistFromDevice, saveAimAssistToDevice } from "./model/aimAssistPreference.js";
import { SpaceshipCanvas } from "./SpaceshipCanvas.js";
import { TeamUpgradeOverlay } from "./TeamUpgradeOverlay.js";
import { VisibleDemoOverlay } from "./VisibleDemoOverlay.js";
import { RunResultOverlay } from "./RunResultOverlay.js";
import { createPreviewRoomView, PREVIEW_CAMERA_VIEW_WIDTH } from "./previewMode.js";
import { DiagnosticsHud } from "./components/DiagnosticsHud/index.js";
import { recordComponentCommit } from "./model/componentCost.js";
import {
  BattleHudPanel,
  BossPanel,
  CockpitPanel,
  CountdownPanel,
  CrewLatencyPanel,
  ModuleWindowPanel
} from "./screens/BattleScreen/panels.js";
import { MaintenanceNotice } from "./components/MaintenanceNotice/index.js";
import { createControllerJoinUrl } from "./roomView.js";
import { useShipPrediction } from "./model/hooks/useShipPrediction.js";
import type { PredictionDriver } from "./model/shipPrediction.js";
import { CONTROLLER_URL, GAME_SERVER_URL } from "./model/environment.js";
import { toAimWorld, toPredictionWorld } from "./model/cockpitWorld.js";
import { selectModuleTree } from "./model/moduleTree.js";
import { readDisplaySearch, readDisplayUrlFlags } from "./model/urlFlags.js";
import { readLiveGame } from "./model/liveView.js";
import { publishWorld } from "./model/worldStore.js";
import {
  readDiagnostics,
  readFrameStats,
  recordCommitWork,
  writeFrameStats,
  writePlaybackDelay,
  writePredictionLag
} from "./model/instruments.js";
import { useDiagnosticsMeters } from "./model/hooks/useDiagnosticsMeters.js";
import { useRoomSession, type ConnectionStatus } from "./model/hooks/useRoomSession.js";
import { useDisplaySwitches } from "./model/hooks/useDisplaySwitches.js";
import { useLiveHeat } from "./model/hooks/useLiveHeat.js";
import { useRuntimePreload } from "./model/hooks/useRuntimePreload.js";
import { useMaintenance, useShipCatalogue } from "./model/hooks/useServerStatus.js";

export function DisplayApp() {
  const portrait = useIsPortrait();
  const {
    preview,
    diagnostics,
    visibleDemo,
    allowStartWave,
    initialStartWave,
    shipArchetypeId: urlShipArchetypeId
  } = readDisplayUrlFlags(readDisplaySearch(), {
    dev: import.meta.env.DEV,
    visibleDemo: import.meta.env.VITE_VISIBLE_DEMO
  });
  /**
   * The ship this page is flying, as the reconciler currently has it.
   *
   * A ref, and that is the whole point: it is written every animation frame,
   * and a state update at that rate re-renders the battle tree a hundred times
   * a second. The scene reads it directly instead, which is also how the patch
   * stops being a reason to redraw the interface at all.
   */
  /**
   * The function the scene calls at the top of each drawn frame: it steps the
   * prediction, sends what it stepped and returns the pose. Held in a ref
   * because it is handed to Phaser once, not re-rendered.
   */
  const predictionDriverReference = useRef<PredictionDriver | undefined>(undefined);

  const {
    predictionEnabled,
    vectorsEnabled,
    interfaceEnabled,
    opaquePanels,
    togglePrediction,
    toggleVectors,
    toggleInterface,
    toggleOpaquePanels
  } = useDisplaySwitches();
  const worldReady = useRuntimePreload();
  const {
    view: networkView,
    status,
    error,
    closingRoom,
    connectionEpoch,
    cockpitPlayer,
    cockpitSeat,
    room,
    sessionId,
    createRoom,
    closeRoom: handleCloseRoom,
    sendCockpitReady,
    sendCockpitVote,
    readSocket
  } = useRoomSession(visibleDemo);
  // Read once: it is a device preference, and re-reading storage every render
  // would answer the same question a hundred times a second.
  const [aimAssist, setAimAssist] = useState(readAimAssistFromDevice);
  const [previewPhase, setPreviewPhase] = useState<PreviewPhase>("combat");
  const shellReference = useRef<HTMLElement>(null);
  const [previewCameraViewWidth, setPreviewCameraViewWidth] = useState(PREVIEW_CAMERA_VIEW_WIDTH);
  const shipCatalogue = useShipCatalogue(GAME_SERVER_URL);
  const maintenance = useMaintenance(GAME_SERVER_URL, status === "connected");
  // Layout preview feeds the same view the network fills, so the HUD, overlays
  // and the Phaser frame all render through the production path.
  const previewView = useMemo(() => {
    if (!preview) return undefined;
    const built = createPreviewRoomView(previewPhase, previewCameraViewWidth);
    /*
     * Published from the memo rather than an effect, because the preview is
     * also how the battle screen is rendered to static markup in tests, and
     * effects do not run there - the panels would find an empty store and draw
     * nothing. The memo runs during this render and before any child's, so they
     * see the fixture on the first pass.
     */
    publishWorld(built);
    return built;
  }, [preview, previewPhase, previewCameraViewWidth]);
  const view = previewView ?? networkView;
  /*
   * Hooks cannot hide behind a branch, so the cockpit's wire half is always
   * mounted and simply has nothing to send until this page is also the pilot.
   * The generation is the controller's own recipe — a new run or a new
   * connection restarts the sequences the room watermarks.
   */
  const cockpitControls: SoloCockpitControls = useSoloCockpit({
    enabled: cockpitPlayer !== undefined && view?.game?.encounter.phase === "combat",
    /*
     * The switch itself, not the combat-gated one below.
     *
     * Gating this on the phase too let both paths run at once between waves:
     * the stream stopped, the schedulers woke up, and the room answered their
     * commands with `invalid_phase` - two paths sending sixty messages a second
     * against a ceiling of fifty, which 0.18 answers by closing the connection.
     * That is the frozen world with a ship still flying: the socket was gone
     * and prediction carried on alone.
     */
    streaming: cockpitPlayer !== undefined,
    aimAssistEnabled: aimAssist,
    world: toAimWorld(view?.game),
    roomId: view?.roomId ?? "",
    playerId: sessionId,
    runNumber: view?.runNumber ?? 0,
    generation: `${String(view?.runNumber ?? 0)}:${String(connectionEpoch)}`,
    send: (type, payload) => {
      room?.send(type, payload);
    }
  });

  /*
   * Prediction of the two angles the hand feels first, drawn from a ref rather
   * than from state: it is written every animation frame, and a re-render at
   * that rate would cost more than the lag it removes. The snapshot arrives at
   * twenty a second and the render reads whatever the predictor last wrote, so
   * the runtime interpolates between predicted samples instead of authoritative
   * ones — the ping and the playback buffer drop out of the angles.
   */
  useDiagnosticsMeters({ enabled: diagnostics, readSocket, connectionEpoch, status });

  /*
   * The same gate the cockpit's own sending uses, and it has to be: the room
   * only spends input while a run is stepping, so frames sent in the lobby are
   * never acknowledged and pile up until the replay buffer overflows - which it
   * did, at ninety-five frames, about five seconds of waiting.
   */
  /*
   * With the interface off there is nothing left to steer with, and a ship
   * standing still measures nothing. The canvas becomes the stick.
   */
  useBareControls(
    shellReference,
    cockpitControls,
    !interfaceEnabled && cockpitPlayer !== undefined
  );

  const streaming = cockpitPlayer !== undefined && view?.game?.encounter.phase === "combat";
  useShipPrediction({
    room,
    enabled: streaming,
    /*
     * The switch turns prediction off, not the input off.
     *
     * One cockpit, one input path: the frames go out either way and the room
     * flies the ship either way. All this decides is whether the scene draws
     * the pose this page stepped or the one the room sent - which is the only
     * way the comparison means anything.
     */
    predicting: predictionEnabled,
    source: {
      readIntent: () => cockpitControls.readIntent(),
      enabled: streaming
    },
    world: toPredictionWorld(view?.game),
    onDriver: (driver) => {
      predictionDriverReference.current = driver;
    },
    onPending: (pending, driftEma) => {
      writePredictionLag(pending, driftEma);
    },
    onDelay: (delayMs, intervalMs) => {
      writePlaybackDelay(delayMs, intervalMs);
    }
  });

  /*
   * Keyboard and mouse, wired to the very same handlers the sticks drive, so
   * nothing downstream learns which one gave the order. The ship's place on
   * screen is read from the canvas host's box, which is what the mouse bearing
   * has to be measured from.
   */
  useCockpitKeyboard({
    enabled: cockpitPlayer !== undefined && view?.game?.encounter.phase === "combat",
    shipScreenPoint: () => {
      const host = document.querySelector(".battlefield-shell");
      if (host === null) return null;
      const box = host.getBoundingClientRect();
      return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    },
    ...cockpitControls
  });

  // The readouts move into the letterbox on glass that leaves enough of one;
  // the frame is the camera's, so the arithmetic is the camera's too.
  const bars = useLetterboxBars(
    shellReference,
    view?.game?.cameraViewWidth ?? PREVIEW_CAMERA_VIEW_WIDTH,
    view?.game != null
  );
  const activeStatus: ConnectionStatus = previewView === undefined ? status : "connected";
  const joinUrl = useMemo(
    () => (view === undefined ? "" : createControllerJoinUrl(CONTROLLER_URL, view.roomId)),
    [view]
  );
  const moduleTree = selectModuleTree(
    shipCatalogue?.ships,
    view?.shipArchetypeId,
    previewView !== undefined
  );

  /**
   * The world as of the newest patch, for the scene to pull.
   *
   * Stable across renders on purpose: the scene is handed this once and calls
   * it every frame, so a new function each render would be a new subscription
   * each render.
   */

  /**
   * Every instrument, read at the moment the panel asks.
   *
   * Stable across renders so the panel keeps one timer: everything inside is a
   * reference written by the frame loop, the socket or the patch handler, none
   * of which render the page to do it.
   */
  /**
   * The world the dial reads, whichever half of the app is driving it.
   *
   * The scene's reader answers only for a room; this one answers for the layout
   * preview too, which has no room and hands its fixture straight down.
   */
  const latestViewReference = useRef(view);
  latestViewReference.current = view;
  const readRadarGame = useCallback(() => latestViewReference.current?.game ?? undefined, []);

  useLiveHeat(shellReference);

  if ((activeStatus !== "connected" && activeStatus !== "reconnecting") || view === undefined) {
    return (
      <CreateRoomScreen
        maintenance={maintenance}
        status={status}
        error={error}
        visibleDemo={visibleDemo}
        allowStartWave={allowStartWave}
        initialStartWave={initialStartWave}
        ships={shipCatalogue?.ships ?? []}
        defaultShipId={urlShipArchetypeId ?? shipCatalogue?.defaultShipId}
        onCreate={(crewSize, shipArchetypeId, startWave, cockpitPlayerName) =>
          void createRoom(crewSize, shipArchetypeId, startWave, cockpitPlayerName)
        }
      />
    );
  }

  return (
    <main
      ref={shellReference}
      className={`display-shell ${view.game === null ? "" : "display-shell--battle"}${cockpitPlayer === undefined ? "" : " display-shell--cockpit"}`}
      data-panels={opaquePanels ? "opaque" : "glass"}
      data-bars={bars.placement}
      style={{ "--bar-thickness": `${String(Math.round(bars.thickness))}px` } as CSSProperties}
    >
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
          {/*
            The instrument panel says both of these, and says them better. While
            it is open the header gives the room back rather than printing the
            same numbers twice; without the flag nothing here changes.
          */}
          {!diagnostics && (
            <span className="latency-indicator" aria-live="polite">
              Экран → сервер {formatLatency(view.displayLatencyMs)}
            </span>
          )}
          {view.game !== null && !diagnostics && <PolledFpsReadout read={readFrameStats} />}
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
      <MaintenanceNotice
        active={view.maintenanceActive}
        secondsRemaining={view.maintenanceSecondsRemaining}
      />

      <LobbyLayout
        view={view}
        joinUrl={joinUrl}
        {...(cockpitPlayer === undefined
          ? {}
          : {
              cockpit: {
                ready: cockpitSeat?.ready === true,
                onReady: sendCockpitReady,
                worldReady
              }
            })}
      />

      {view.game === null ? (
        <section id="game-canvas" className="game-stage game-stage--waiting">
          <span>
            {cockpitPlayer === undefined
              ? "Полёт начнётся, когда pilot, gunner и shield нажмут «Готов»"
              : "Полёт начнётся, когда вы нажмёте «Готов»"}
          </span>
        </section>
      ) : (
        <MeasuredWhenAsked
          measuring={diagnostics}
          onCommit={(actualDuration) => {
            recordCommitWork(actualDuration, performance.now());
          }}
        >
          <section id="game-canvas" className="game-stage" aria-label="Космическое поле боя">
            {/*
              The order is the reference prototype's: the world first, the layer
              a thumb touches next, and the readable interface after both. What
              it buys is that nothing above the canvas is re-rendered or
              re-attributed while the arena is drawing.
            */}
            <MeteredPanel id="сцена" measuring={diagnostics}>
              {portrait ? (
                <RotateNotice />
              ) : (
                <SpaceshipCanvas
                  game={view.game}
                  prediction={predictionDriverReference.current}
                  // The preview has no room to read from: it renders a fixture
                  // straight through the prop, and a reader that answers nothing
                  // would leave its scene without a world at all.
                  readGame={previewView === undefined ? readLiveGame : undefined}
                  runNumber={view.runNumber}
                  connectionEpoch={connectionEpoch}
                  visibleDemo={visibleDemo}
                  vectorsEnabled={vectorsEnabled}
                  onFrameStats={(stats) => {
                    writeFrameStats(stats);
                  }}
                />
              )}
            </MeteredPanel>
            <MeteredPanel id="кокпит" measuring={diagnostics}>
              {cockpitPlayer !== undefined && !portrait && interfaceEnabled && (
                <CockpitPanel
                  controls={cockpitControls}
                  aimAssist={aimAssist}
                  onAimAssistChange={(next) => {
                    setAimAssist(next);
                    saveAimAssistToDevice(next);
                  }}
                />
              )}
            </MeteredPanel>
            <MeteredPanel id="шапка" measuring={diagnostics}>
              {interfaceEnabled && <BattleHudPanel />}
            </MeteredPanel>

            <MeteredPanel id="часы" measuring={diagnostics}>
              <CountdownPanel />
            </MeteredPanel>
            <MeteredPanel id="босс" measuring={diagnostics}>
              <BossPanel />
            </MeteredPanel>
            <MeteredPanel id="приборы" measuring={diagnostics}>
              {diagnostics && (
                <DiagnosticsHud
                  read={readDiagnostics}
                  predictionEnabled={predictionEnabled}
                  onTogglePrediction={togglePrediction}
                  vectorsEnabled={vectorsEnabled}
                  onToggleVectors={toggleVectors}
                  interfaceEnabled={interfaceEnabled}
                  onToggleInterface={toggleInterface}
                  opaquePanels={opaquePanels}
                  onToggleOpaquePanels={toggleOpaquePanels}
                />
              )}
            </MeteredPanel>
            <MeteredPanel id="радар" measuring={diagnostics}>
              {interfaceEnabled && <PolledCombatRadar read={readRadarGame} />}
            </MeteredPanel>
            {view.game.encounter.phase === "intermission" && (
              <TeamUpgradeOverlay
                teamUpgrade={view.game.teamUpgrade}
                credits={view.game.credits}
                score={view.game.encounter.score}
                waveNumber={view.game.encounter.waveNumber}
                phaseTicksRemaining={view.game.encounter.phaseTicksRemaining}
                purchasedModules={view.game.purchasedModules}
                {...(cockpitSeat === undefined
                  ? {}
                  : { cockpit: { role: cockpitSeat.role, onVote: sendCockpitVote } })}
              />
            )}
            {view.game.encounter.phase === "result" && view.game.encounter.outcome !== null && (
              <RunResultOverlay
                outcome={view.game.encounter.outcome}
                defeatReason={view.game.encounter.defeatReason}
                waveNumber={view.game.encounter.waveNumber}
                score={view.game.encounter.score}
                readyCount={view.players.filter(({ ready }) => ready).length}
                crewSize={view.crewSize}
                closing={closingRoom}
                onClose={() => void handleCloseRoom()}
                {...(cockpitPlayer === undefined
                  ? {}
                  : {
                      cockpit: {
                        ready: cockpitSeat?.ready === true,
                        onReady: sendCockpitReady
                      }
                    })}
              />
            )}
            {/* The run's own hull, straight from the catalogue; the fixture is
              the preview's stand-in when no server answered. */}
            <MeteredPanel id="модули" measuring={diagnostics}>
              {moduleTree !== undefined && interfaceEnabled && (
                <ModuleWindowPanel
                  tiers={moduleTree.tiers}
                  endlessTier={moduleTree.endlessTier}
                  initiallyShown={previewView !== undefined}
                />
              )}
            </MeteredPanel>
            {/*
            Stacked directly under the instrument panel and answering the same
            question, so with the panel open it is the third ping on one edge of
            the screen. The panel wins; the crew rows come back the moment the
            flag goes away.
          */}
            <MeteredPanel id="экипаж" measuring={diagnostics}>
              {!diagnostics && <CrewLatencyPanel />}
            </MeteredPanel>
          </section>
        </MeasuredWhenAsked>
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

/**
 * The snapshot the canvas draws, with the two predicted angles standing in.
 *
 * Only those two, and only when a cockpit is predicting: everything else stays
 * exactly as the server sent it. Position in particular is untouched — being
 * wrong about an angle corrects itself, being wrong about a position walks the
 * ship through a rock and then teleports it back out.
 */

/**
 * Wraps the battle in React's profiler only when the instruments were asked
 * for.
 *
 * A profiler is not free: it times every commit whether or not anyone reads the
 * number, and this tree commits on every patch. Mounted unconditionally it made
 * the shared screen slower for every player who never opened the panel - and it
 * showed, in a browser test that clears a wave against a clock.
 *
 * `measuring` comes from the address and never changes while the page lives, so
 * the branch cannot remount the battle underneath a running fight.
 */
/**
 * One panel, timed under its own name.
 *
 * Same bargain as the tree above: nothing is mounted unless the instruments
 * were asked for, because a profiler around eight panels is eight timers on
 * every commit of a page that commits on every patch.
 */
function MeteredPanel({
  id,
  measuring,
  children
}: {
  readonly id: string;
  readonly measuring: boolean;
  readonly children: ReactNode;
}) {
  if (!measuring) return children;
  return (
    <Profiler
      id={id}
      onRender={(profilerId, _phase, actualDuration) => {
        recordComponentCommit(profilerId, actualDuration);
      }}
    >
      {children}
    </Profiler>
  );
}

function MeasuredWhenAsked({
  measuring,
  onCommit,
  children
}: {
  readonly measuring: boolean;
  readonly onCommit: (actualDurationMs: number) => void;
  readonly children: ReactNode;
}) {
  if (!measuring) return children;
  return (
    <Profiler
      id="battle"
      onRender={(_id, _phase, actualDuration) => {
        onCommit(actualDuration);
      }}
    >
      {children}
    </Profiler>
  );
}
