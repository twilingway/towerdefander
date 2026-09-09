import type { DisplayRoomView, PublicShip } from "@spaceship-defender/protocol";
import { formatLatency, type PreviewPhase } from "@spaceship-defender/client-shared";
import { useCallback, useMemo, useRef, useState, type CSSProperties } from "react";

import { PolledFpsReadout } from "../../components/FpsReadout/index.js";
import { LobbyLayout } from "../../components/LobbyLayout/index.js";
import { MaintenanceNotice } from "../../components/MaintenanceNotice/index.js";
import { useIsPortrait } from "../../components/RotateNotice/index.js";
import { VisibleDemoOverlay } from "../../components/VisibleDemoOverlay/index.js";
import { readAimAssistFromDevice } from "../../model/aimAssistPreference.js";
import { toAimWorld, toPredictionWorld } from "../../model/cockpitWorld.js";
import { CONTROLLER_URL } from "../../model/environment.js";
import { useBareControls } from "../../model/hooks/useBareControls.js";
import { useCockpitKeyboard } from "../../model/hooks/useCockpitKeyboard.js";
import type { DisplaySwitches } from "../../model/hooks/useDisplaySwitches.js";
import { useLetterboxBars } from "../../model/hooks/useLetterboxBars.js";
import { useLiveHeat } from "../../model/hooks/useLiveHeat.js";
import { useShipPrediction } from "../../model/hooks/useShipPrediction.js";
import { useSoloCockpit, type SoloCockpitControls } from "../../model/hooks/useSoloCockpit.js";
import { useDevCockpitControls } from "../../model/devControls.js";
import type { RoomSession } from "../../model/hooks/useRoomSession.js";
import { readFrameStats, writePlaybackDelay, writePredictionLag } from "../../model/instruments.js";
import { selectModuleTree } from "../../model/moduleTree.js";
import { PREVIEW_CAMERA_VIEW_WIDTH } from "../../model/preview/world.js";
import { createControllerJoinUrl } from "../../model/roomView.js";
import type { PredictionDriver } from "../../model/shipPrediction.js";
import { BattleStage } from "./BattleStage.js";
import { PreviewControls } from "./PreviewControls.js";

/** The switcher the layout preview puts over the room, and nothing else has. */
export interface RoomPreview {
  readonly phase: PreviewPhase;
  readonly onPhaseChange: (phase: PreviewPhase) => void;
  readonly cameraViewWidth: number;
  readonly onCameraViewWidthChange: (cameraViewWidth: number) => void;
}

interface RoomScreenProps {
  readonly view: DisplayRoomView;
  readonly diagnostics: boolean;
  readonly visibleDemo: boolean;
  readonly switches: DisplaySwitches;
  readonly worldReady: boolean;
  readonly ships: readonly PublicShip[] | undefined;
  /** Absent in the layout preview: there is no room to talk to. */
  readonly session: RoomSession | undefined;
  /** Present only in the layout preview; its presence *is* "this is a fixture". */
  readonly preview: RoomPreview | undefined;
  readonly onCloseRoom: () => void;
  readonly onReady: () => void;
  readonly onVote: RoomSession["sendCockpitVote"];
}

/**
 * The shared screen once there is a room to show: the header, the join card
 * while the crew gathers, and the fight once it starts.
 *
 * The cockpit's four hooks are called here rather than bundled into one, so the
 * order stays visible: the prediction driver is written by an effect and read
 * during the render that mounts the canvas, which only works while the hook and
 * the canvas sit in the same pass.
 */
export function RoomScreen({
  view,
  diagnostics,
  visibleDemo,
  switches,
  worldReady,
  ships,
  session,
  preview,
  onCloseRoom,
  onReady,
  onVote
}: RoomScreenProps) {
  const portrait = useIsPortrait();
  // Read once: it is a device preference, and re-reading storage every render
  // would answer the same question a hundred times a second.
  const [aimAssist, setAimAssist] = useState(readAimAssistFromDevice);
  const shellReference = useRef<HTMLElement>(null);
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

  /*
   * Hooks cannot hide behind a branch, so the cockpit's wire half is always
   * mounted and simply has nothing to send until this page is also the pilot.
   * The generation is the controller's own recipe — a new run or a new
   * connection restarts the sequences the room watermarks.
   */
  const cockpitControls: SoloCockpitControls = useSoloCockpit({
    enabled: session?.cockpitPlayer !== undefined && view.game?.encounter.phase === "combat",
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
    streaming: session?.cockpitPlayer !== undefined,
    aimAssistEnabled: aimAssist,
    world: toAimWorld(view.game),
    roomId: view.roomId,
    playerId: session?.sessionId ?? "",
    runNumber: view.runNumber,
    generation: `${String(view.runNumber)}:${String(session?.connectionEpoch ?? 0)}`,
    send: (type, payload) => {
      session?.room?.send(type, payload);
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
    !switches.interfaceEnabled && session?.cockpitPlayer !== undefined
  );

  const streaming = session?.cockpitPlayer !== undefined && view.game?.encounter.phase === "combat";
  useShipPrediction({
    room: session?.room,
    enabled: streaming,
    /*
     * The switch turns prediction off, not the input off.
     *
     * One cockpit, one input path: the frames go out either way and the room
     * flies the ship either way. All this decides is whether the scene draws
     * the pose this page stepped or the one the room sent - which is the only
     * way the comparison means anything.
     */
    predicting: switches.predictionEnabled,
    source: {
      readIntent: () => cockpitControls.readIntent(),
      enabled: streaming
    },
    world: toPredictionWorld(view.game),
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
    enabled: session?.cockpitPlayer !== undefined && view.game?.encounter.phase === "combat",
    shipScreenPoint: () => {
      const host = document.querySelector(".battlefield-shell");
      if (host === null) return null;
      const box = host.getBoundingClientRect();
      return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    },
    ...cockpitControls
  });

  /*
   * The same orders on `window`, in a dev build only: the cockpit's triggers
   * capture the pointer that pressed them, which a synthetic one cannot
   * satisfy, so a browser check could fly and aim but never fire.
   */
  useDevCockpitControls(
    cockpitControls,
    session?.cockpitPlayer !== undefined && view.game?.encounter.phase === "combat"
  );

  // The readouts move into the letterbox on glass that leaves enough of one;
  // the frame is the camera's, so the arithmetic is the camera's too.
  const bars = useLetterboxBars(
    shellReference,
    view.game?.cameraViewWidth ?? PREVIEW_CAMERA_VIEW_WIDTH,
    view.game != null
  );
  const joinUrl = useMemo(() => createControllerJoinUrl(CONTROLLER_URL, view.roomId), [view]);
  const moduleTree = selectModuleTree(ships, view.shipArchetypeId, preview !== undefined);

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
  const readRadarGame = useCallback(() => latestViewReference.current.game ?? undefined, []);

  useLiveHeat(shellReference);

  return (
    <main
      ref={shellReference}
      className={`display-shell ${view.game === null ? "" : "display-shell--battle"}${session?.cockpitPlayer === undefined ? "" : " display-shell--cockpit"}`}
      data-panels={switches.opaquePanels ? "opaque" : "glass"}
      data-bars={bars.placement}
      style={{ "--bar-thickness": `${String(Math.round(bars.thickness))}px` } as CSSProperties}
    >
      {preview !== undefined && (
        <PreviewControls
          phase={preview.phase}
          onPhaseChange={preview.onPhaseChange}
          cameraViewWidth={preview.cameraViewWidth}
          onCameraViewWidthChange={preview.onCameraViewWidthChange}
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
            onClick={() => {
              onCloseRoom();
            }}
            disabled={session?.closingRoom === true}
          >
            {session?.closingRoom === true ? "Закрываем комнату…" : "Закрыть комнату"}
          </button>
        </div>
      </header>
      {session !== undefined && session.error.length > 0 && (
        <p className="error-message">{session.error}</p>
      )}
      <MaintenanceNotice
        active={view.maintenanceActive}
        secondsRemaining={view.maintenanceSecondsRemaining}
      />

      <LobbyLayout
        view={view}
        joinUrl={joinUrl}
        {...(session?.cockpitPlayer === undefined
          ? {}
          : {
              cockpit: {
                ready: session.cockpitSeat?.ready === true,
                onReady,
                worldReady
              }
            })}
      />

      {view.game === null ? (
        <section id="game-canvas" className="game-stage game-stage--waiting">
          <span>
            {session?.cockpitPlayer === undefined
              ? "Полёт начнётся, когда pilot, gunner и shield нажмут «Готов»"
              : "Полёт начнётся, когда вы нажмёте «Готов»"}
          </span>
        </section>
      ) : (
        <BattleStage
          view={{ ...view, game: view.game }}
          diagnostics={diagnostics}
          visibleDemo={visibleDemo}
          preview={preview !== undefined}
          portrait={portrait}
          connectionEpoch={session?.connectionEpoch ?? 0}
          switches={switches}
          moduleTree={moduleTree}
          readRadarGame={readRadarGame}
          cockpit={{
            seated: session?.cockpitPlayer !== undefined,
            seat: session?.cockpitSeat,
            controls: cockpitControls,
            driver: predictionDriverReference.current,
            onVote: onVote,
            onReady: onReady
          }}
          closingRoom={session?.closingRoom === true}
          onCloseRoom={onCloseRoom}
          aimAssist={aimAssist}
          onAimAssistChange={setAimAssist}
        />
      )}
      {visibleDemo ? (
        <VisibleDemoOverlay
          connectionStatus={session?.status ?? "connected"}
          phase={view.game?.encounter.phase ?? view.phase}
          waveNumber={view.game?.encounter.waveNumber}
          snapshotTick={view.game?.tick}
        />
      ) : null}
    </main>
  );
}
