import type { DisplayRoomView, PublicPlayerView, PublicShip } from "@spaceship-defender/protocol";
import { formatLatency, type PreviewPhase } from "@spaceship-defender/client-shared";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { readLiveGame } from "../../model/liveView.js";
import { PolledFpsReadout } from "../../components/FpsReadout/index.js";
import { LobbyLayout } from "../../components/LobbyLayout/index.js";
import { MaintenanceNotice } from "../../components/MaintenanceNotice/index.js";
import { useIsPortrait } from "../../components/RotateNotice/index.js";
import { VisibleDemoOverlay } from "../../components/VisibleDemoOverlay/index.js";
import { readArenaCentre } from "../../model/arenaPointer.js";
import { toAimWorld, toPredictionWorld } from "../../model/cockpitWorld.js";
import { CONTROLLER_URL } from "../../model/environment.js";
import { useBareControls } from "../../model/hooks/useBareControls.js";
import { useCockpitKeyboard } from "../../model/hooks/useCockpitKeyboard.js";
import type { DisplaySwitches } from "../../model/hooks/useDisplaySwitches.js";
import { HUD_FRAME_CSS_VARIABLES } from "../../model/hudFrames.js";
import { useLiveHeat } from "../../model/hooks/useLiveHeat.js";
import { useWorldFrame } from "../../model/hooks/useWorldFrame.js";
import { useShipPrediction } from "../../model/hooks/useShipPrediction.js";
import { useSoloCockpit, type SoloCockpitControls } from "../../model/hooks/useSoloCockpit.js";
import { useDevCockpitControls } from "../../model/devControls.js";
import type { RoomSession } from "../../model/hooks/useRoomSession.js";
import { readFrameStats, writePlaybackDelay, writePredictionLag } from "../../model/instruments.js";
import { selectModuleTree } from "../../model/moduleTree.js";
import { createControllerJoinUrl } from "../../model/roomView.js";
import type { PredictedInputFrame, PredictionDriver } from "../../model/shipPrediction.js";
import { BattleStage } from "./BattleStage.js";
import { SettingsPanel } from "./SettingsPanel.js";
import { PreviewControls } from "./PreviewControls.js";

/** The switcher the layout preview puts over the room, and nothing else has. */
export interface RoomPreview {
  readonly phase: PreviewPhase;
  readonly onPhaseChange: (phase: PreviewPhase) => void;
  readonly cameraViewWidth: number;
  readonly onCameraViewWidthChange: (cameraViewWidth: number) => void;
}

/**
 * Who is flying this page, for a screen that no longer cares where the run is
 * hosted: a seat in a room or a simulation stepping in this very tab.
 */
export interface CockpitSource {
  readonly playerId: string;
  /** Restarts the input sequence the room watermarks; a local run has none. */
  readonly generation: number;
  readonly seat: PublicPlayerView | undefined;
  /** Absent on a local run: there is nowhere to send an intent to. */
  readonly send?: (type: string, payload: unknown) => void;
  /** Present on a local run: the scene steps the simulation through it. */
  readonly driver?: PredictionDriver | undefined;
  /**
   * Hands the cockpit's reader back to whoever is hosting the run.
   *
   * A networked cockpit sends its intents and needs nobody to ask; a local run
   * has to pull one every step, and the controls are mounted here rather than
   * above. So the screen offers them upward instead of the host reaching in.
   */
  readonly onControls?: (read: () => PredictedInputFrame) => void;
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
  /**
   * Whether this page is flying the ship, and what drives it when it is.
   *
   * Asked rather than derived, because the answer no longer comes from one
   * place: a networked cockpit holds a seat in a room, and a local run has no
   * room at all. Everything below used to ask the session ten times over, which
   * made "is this page flying" and "is there a connection" the same question.
   */
  readonly cockpit: CockpitSource | undefined;
  /** Present only in the layout preview; its presence *is* "this is a fixture". */
  readonly preview: RoomPreview | undefined;
  readonly onCloseRoom: () => void;
  /** Leaving a match that is over for you, without ending it for the bots. */
  readonly onLeaveRoom: () => void;
  /** One radar sweep; the room decides whether one is due. */
  readonly onScan: () => void;
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
  cockpit: cockpitSource,
  preview,
  onCloseRoom,
  onLeaveRoom,
  onScan,
  onReady,
  onVote
}: RoomScreenProps) {
  const portrait = useIsPortrait();
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
    enabled: cockpitSource !== undefined && view.game?.encounter.phase === "combat",
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
    streaming: cockpitSource !== undefined,
    /*
     * Off on every device while the assist is reworked. Its toggle left the
     * cockpit on 2026-09-13, and a device that still had the help on - every
     * device that never touched the toggle - was left with no way to turn it off.
     */
    aimAssistEnabled: false,
    world: toAimWorld(view.game),
    roomId: view.roomId,
    playerId: cockpitSource?.playerId ?? "",
    runNumber: view.runNumber,
    generation: `${String(view.runNumber)}:${String(cockpitSource?.generation ?? 0)}`,
    send: (type, payload) => {
      cockpitSource?.send?.(type, payload);
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
  /*
   * The host asked to read the hand itself: a local run has no stream to send
   * intents down and pulls one per simulation step instead.
   */
  const offerControls = cockpitSource?.onControls;
  useEffect(() => {
    offerControls?.(() => cockpitControls.readIntent());
  }, [offerControls, cockpitControls]);

  useBareControls(
    shellReference,
    cockpitControls,
    !switches.interfaceEnabled && cockpitSource !== undefined
  );

  const streaming = cockpitSource !== undefined && view.game?.encounter.phase === "combat";
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
    enabled: cockpitSource !== undefined && view.game?.encounter.phase === "combat",
    shipScreenPoint: () => readArenaCentre(document),
    ...cockpitControls
  });

  /*
   * The same orders on `window`, in a dev build only: the cockpit's triggers
   * capture the pointer that pressed them, which a synthetic one cannot
   * satisfy, so a browser check could fly and aim but never fire.
   */
  useDevCockpitControls(
    cockpitControls,
    cockpitSource !== undefined && view.game?.encounter.phase === "combat"
  );

  const joinUrl = useMemo(() => createControllerJoinUrl(CONTROLLER_URL, view.roomId), [view]);
  /** Sixteen published hulls is a match and nothing else has them. */
  const match = (view.game?.arenaShips.length ?? 0) > 0;
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
   * The room's own store first, and the render-time view only as a fallback.
   * That order is the whole point: this page deliberately does not re-render
   * while the arena is drawing, so a reader that answers out of a render is as
   * fresh as the last commit - which in a fight is seconds ago. The dial then
   * held one reading while the shield drained past it and jumped when a commit
   * finally happened, which is exactly what "the recovery bar is jerky" was.
   * The scene and the heat gauges already read the store for this reason.
   *
   * The fallback is not dead code: the layout preview has no room, never writes
   * the store, and hands its fixture down through the view.
   */
  const latestViewReference = useRef(view);
  latestViewReference.current = view;
  const readRadarGame = useCallback(
    () => readLiveGame() ?? latestViewReference.current.game ?? undefined,
    []
  );

  useLiveHeat(shellReference);
  // Where the world lands on this glass, for the frame HUD to stand against.
  useWorldFrame(shellReference, view.game?.cameraViewWidth);

  return (
    <main
      ref={shellReference}
      className={`display-shell ${view.game === null ? "" : "display-shell--battle"}${cockpitSource === undefined ? "" : " display-shell--cockpit"}`}
      data-panels={switches.opaquePanels ? "opaque" : "glass"}
      /*
       * A fight is always in the frames. The attribute stays, constant, because
       * every frame rule is scoped by it and loses to the shared base rules
       * without it; the lobby has no fight and wears neither, as before.
       */
      data-hud-skin={view.game === null ? undefined : "frame"}
      style={view.game === null ? {} : HUD_FRAME_CSS_VARIABLES}
    >
      {preview !== undefined && (
        <PreviewControls
          phase={preview.phase}
          onPhaseChange={preview.onPhaseChange}
          cameraViewWidth={preview.cameraViewWidth}
          onCameraViewWidthChange={preview.onCameraViewWidthChange}
        />
      )}
      <header className={`room-header${match ? " room-header--match" : ""}`}>
        {/*
         * A match has no room to publish and no crew to join it: the code is
         * how a phone finds a shared screen, and the badge names a phase the
         * arena does not have. Both sat on top of the readouts a pilot actually
         * uses, which is where they were.
         */}
        {/* Nor does a fight: the crew joined in the lobby, and a dropped phone
          comes back through its own session rather than by the code. */}
        {!match && view.game === null && (
          <div>
            {/*
             * The way back out of a lobby. A phone hides the header's readouts,
             * the gear and its "close the room" among them, so a room opened by
             * mistake had no exit short of reloading the page.
             */}
            <button
              type="button"
              className="link-button room-leave"
              data-testid="lobby-leave"
              disabled={session?.closingRoom === true}
              onClick={onCloseRoom}
            >
              {session?.closingRoom === true ? "Закрываем…" : "← Выйти из комнаты"}
            </button>
            <p className="eyebrow">Комната</p>
            <strong className="room-code">{view.roomId}</strong>
          </div>
        )}
        <div className="room-network">
          {/*
           * Only while the crew is still gathering.
           *
           * In a fight the badge said "Корабль в бою" to somebody who is
           * flying it: the one state it could report that the screen was not
           * already reporting is the other one.
           */}
          {!match && view.phase !== "active" && (
            <div className={`phase-badge phase-badge--${view.phase}`}>Собираем экипаж</div>
          )}
          {/*
            The instrument panel says both of these, and says them better. While
            it is open the header gives the room back rather than printing the
            same numbers twice; without the flag nothing here changes.
          */}
          {!diagnostics && (
            <span className="latency-indicator" aria-live="polite">
              ping {formatLatency(view.displayLatencyMs)}
            </span>
          )}
          {view.game !== null && !diagnostics && <PolledFpsReadout read={readFrameStats} />}
          {/*
           * The way out lives behind the gear rather than beside the readouts.
           *
           * A red button in the corner of a fight is the brightest thing on the
           * screen and the one a pilot least wants to press; behind a gear it
           * is where somebody looks when they have decided to leave, next to
           * the other thing they came to change.
           *
           * Leaving a match is not closing a room: the fifteen other hulls go
           * on fighting, and the room lives until the match is decided.
           */}
          <SettingsPanel
            action={{
              label:
                session?.closingRoom === true
                  ? match
                    ? "Выходим…"
                    : "Закрываем комнату…"
                  : match
                    ? "Выйти из боя"
                    : "Закрыть комнату",
              confirmLabel: match ? "Точно выйти?" : "Закрыть для всех?",
              disabled: session?.closingRoom === true,
              onClick: () => {
                if (match) onLeaveRoom();
                else onCloseRoom();
              }
            }}
          />
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
        {...(cockpitSource === undefined
          ? {}
          : {
              cockpit: {
                ready: cockpitSource.seat?.ready === true,
                onReady,
                worldReady
              }
            })}
      />

      {view.game === null ? (
        <section id="game-canvas" className="game-stage game-stage--waiting">
          <span>
            {view.assetsPending
              ? `Загружаем ресурсы… ${String(view.assetsWaitSecondsRemaining)} с`
              : cockpitSource === undefined
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
            seated: cockpitSource !== undefined,
            seat: cockpitSource?.seat,
            controls: cockpitControls,
            driver: cockpitSource?.driver ?? predictionDriverReference.current,
            onVote: onVote,
            onReady: onReady
          }}
          closingRoom={session?.closingRoom === true}
          onCloseRoom={onCloseRoom}
          onLeaveRoom={onLeaveRoom}
          onScan={onScan}
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
