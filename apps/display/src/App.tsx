import { Client, type Room } from "@colyseus/sdk";
import type { MaintenanceState } from "@spaceship-defender/protocol";
import { SIMULATION_TICK_RATE } from "@spaceship-defender/game-core";
import {
  CAMERA_VIEW_ASPECT,
  CAMERA_VIEW_WIDTH_MAX,
  CAMERA_VIEW_WIDTH_MIN,
  MAX_START_WAVE,
  PATCH_INTERVAL_MS,
  PROTOCOL_VERSION,
  ROOM_REFUSED_AT_CAPACITY,
  ROOM_REFUSED_FOR_MAINTENANCE,
  ROOM_TYPE,
  clientMessage,
  type UpgradeId,
  roomClosingSchema,
  serverErrorSchema,
  serverLatencyProbeSchema,
  serverMessage,
  type CrewSize,
  type DisplayRoomView,
  type PublicShipCatalogue
} from "@spaceship-defender/protocol";
import {
  createActionId,
  createDefaultGameServerUrl,
  formatLatency,
  isPreviewMode,
  nextVoteRevision,
  PreviewPhaseButtons,
  PreviewShell,
  readStringEnvironment,
  type PreviewPhase
} from "@spaceship-defender/client-shared";
import {
  Profiler,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode
} from "react";

import { PolledCombatRadar } from "./CombatRadar.js";
import { useLetterboxBars } from "./useLetterboxBars.js";
import { PolledFpsReadout } from "./components/FpsReadout/index.js";
import { LobbyLayout } from "./components/LobbyLayout/index.js";
import { CreateRoomScreen } from "./screens/CreateRoomScreen/index.js";
import { countDrawnEntities } from "./combatHudViewModel.js";
import { RotateNotice, useIsPortrait } from "./components/RotateNotice/index.js";
import { useSoloCockpit, type SoloCockpitControls } from "./model/hooks/useSoloCockpit.js";
import { useBareControls } from "./model/hooks/useBareControls.js";
import { useCockpitKeyboard } from "./model/hooks/useCockpitKeyboard.js";
import { readAimAssistFromDevice, saveAimAssistToDevice } from "./model/aimAssistPreference.js";
import { SpaceshipCanvas } from "./SpaceshipCanvas.js";
import { TeamUpgradeOverlay } from "./TeamUpgradeOverlay.js";
import { VisibleDemoOverlay } from "./VisibleDemoOverlay.js";
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
import { DiagnosticsHud } from "./components/DiagnosticsHud/index.js";
import { readComponentCosts, recordComponentCommit } from "./model/componentCost.js";
import { publishWorld } from "./model/worldStore.js";
import { writeLiveHeat } from "./model/liveHeat.js";
import {
  BattleHudPanel,
  BossPanel,
  CockpitPanel,
  CountdownPanel,
  CrewLatencyPanel,
  ModuleWindowPanel
} from "./screens/BattleScreen/panels.js";
import { MaintenanceNotice } from "./components/MaintenanceNotice/index.js";
import { createControllerJoinUrl, toDisplayRoomView, type NetworkRoomState } from "./roomView.js";
import { fetchMaintenance } from "./serverStatus.js";
import { fetchShipCatalogue } from "./shipCatalogue.js";
import { isDiagnosticsRequested } from "./model/diagnostics.js";
import { useShipPrediction } from "./model/hooks/useShipPrediction.js";
import type { PredictionDriver } from "./model/shipPrediction.js";
import { advanceWork, createWorkMeter, recordWork } from "./model/workMeter.js";
import { attachTrafficMeter, type TrafficMeter } from "./model/trafficMeter.js";
import { attachLongTaskMeter, type LongTaskMeter } from "./model/longTasks.js";
import {
  buildVisibleDemoWorld,
  isVisibleDemoMode,
  publishVisibleDemoWorld,
  readShipArchetypeId,
  readStartWave
} from "./visibleDemo.js";
import { hasImmediateChange, needsRootRender, PASSIVE_PUBLISH_MS } from "./model/viewPublishing.js";

type DisplayRoom = Room<unknown, NetworkRoomState>;
type ConnectionStatus = "idle" | "connecting" | "connected" | "reconnecting" | "error";

/** Twenty a second: below what a barrel changes at, above what an eye reads. */
const LIVE_HEAT_INTERVAL_MS = 50;

const gameServerUrl = readStringEnvironment(
  import.meta.env.VITE_GAME_SERVER_URL,
  createDefaultGameServerUrl()
);
const controllerUrl = readStringEnvironment(
  import.meta.env.VITE_CONTROLLER_URL,
  createDefaultControllerUrl()
);

export function DisplayApp() {
  const portrait = useIsPortrait();
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
  const diagnostics = isDiagnosticsRequested(
    typeof window === "undefined" ? "" : window.location.search
  );
  const roomReference = useRef<DisplayRoom | undefined>(undefined);
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  /** What was last handed to `setStatus`; see the guard in `applyRoomState`. */
  const statusReference = useRef<ConnectionStatus>("idle");
  const [networkView, setNetworkView] = useState<DisplayRoomView>();
  /**
   * The newest view there is, whether or not React has been told about it.
   *
   * The scene pulls the world from here every frame it draws, which is what
   * lets the page below it commit at its own, far slower pace.
   */
  const liveViewReference = useRef<DisplayRoomView | undefined>(undefined);
  const publishedViewReference = useRef<DisplayRoomView | undefined>(undefined);
  const publishedAtReference = useRef(0);
  const publishTimerReference = useRef<number | undefined>(undefined);
  /** Patches the display's own contract refused, counted rather than fatal. */
  const refusedPatchesReference = useRef(0);
  const [error, setError] = useState("");
  const [connectionEpoch, setConnectionEpoch] = useState(0);
  /** Set when this page is also the pilot; undefined for an ordinary display. */
  const [cockpitPlayer, setCockpitPlayer] = useState<string | undefined>(undefined);
  /** Highest revision this screen has sent; the server refuses a repeat. */
  const cockpitVoteRevision = useRef(0);
  /** Read inside room callbacks, which close over the first render. */
  const cockpitPlayerReference = useRef<string | undefined>(undefined);
  // Read once: it is a device preference, and re-reading storage every render
  // would answer the same question a hundred times a second.
  const [aimAssist, setAimAssist] = useState(readAimAssistFromDevice);
  const [closingRoom, setClosingRoom] = useState(false);
  const [previewPhase, setPreviewPhase] = useState<PreviewPhase>("combat");
  const frameStatsReference = useRef({
    fps: 0,
    averageFrameMs: 0,
    worstFrameMs: 0,
    stutterShare: 0,
    updateMsPerSecond: 0,
    worstUpdateMs: 0,
    liveDrawn: 0,
    offscreen: 0
  });
  /**
   * Off means the ship is drawn from the authoritative angles alone. The point
   * of the switch is that it compares the two on one connection and one tick;
   * comparing two sessions would compare two networks instead.
   */
  const [predictionEnabled, setPredictionEnabled] = useState(true);
  /**
   * How far behind the room the world is drawn, measured rather than chosen.
   *
   * On the panel because it is the number an enemy's smoothness is bought with:
   * too little and the interpolation runs out of snapshots and holds, which
   * reads as a hull stopping dead and then jumping.
   */
  const playbackDelayReference = useRef(0);
  const patchIntervalReference = useRef(0);
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
  /** Written every frame, read twice a second by the panel; never a render. */
  const pendingInputReference = useRef(0);
  const driftReference = useRef(0);

  /**
   * The parallax layers, asked about rather than settled: they are four
   * full-screen sprites and three blends, and a phone is where that is paid for.
   */
  const [backgroundEnabled, setBackgroundEnabled] = useState(true);
  /** The shield's bloom, the other visual worth pricing on the device. */
  const [glowEnabled, setGlowEnabled] = useState(true);
  /** The five overlays the scene rebuilds every frame; the lab has none of these. */
  const [vectorsEnabled, setVectorsEnabled] = useState(true);
  /**
   * Everything React draws over the world, off.
   *
   * The last thing left to rule out: the scene meter says what Phaser spends
   * and the commit meter says what the tree costs, but neither says what the
   * browser spends compositing a dozen translucent panels over a canvas. With
   * them gone the page is the canvas, and whatever is left is the renderer.
   */
  const [interfaceEnabled, setInterfaceEnabled] = useState(true);
  /**
   * Panels the compositor can draw over instead of through.
   *
   * A switch rather than a decision: translucent panels make the GPU draw the
   * arena behind them and blend on top every frame, and whether that matters is
   * a question for the device, not for taste.
   */
  const [opaquePanels, setOpaquePanels] = useState(false);
  /**
   * Whether the renderer's chunk has arrived.
   *
   * Fetched from the lobby rather than when the battle screen mounts: it is a
   * separate chunk carrying the whole of Phaser, and on a phone it lands about
   * a second into a fight that has already started - a second with no world
   * drawn and, worse, nothing driving the cockpit's input, so the first shots
   * went nowhere and the helm did not answer. The seat cannot be ready before
   * the thing that draws its world is.
   */
  const [worldReady, setWorldReady] = useState(false);
  const trafficReference = useRef<TrafficMeter | undefined>(undefined);
  const longTasksReference = useRef<LongTaskMeter | undefined>(undefined);
  /*
   * Written on every patch and read twice a second. A ref rather than state:
   * setting state here would add a render to the very work being measured.
   */
  const snapshotCost = useRef(createWorkMeter());

  /*
   * What React itself costs, from React's own stopwatch rather than a guess.
   * Every patch replaces the view object, so the whole battle tree re-renders
   * with it, and the number of long frames on a phone matches the number of
   * patches almost exactly - which makes this the last unmeasured suspect.
   */
  const commitCost = useRef(createWorkMeter());

  const shellReference = useRef<HTMLElement>(null);
  const [previewCameraViewWidth, setPreviewCameraViewWidth] = useState(PREVIEW_CAMERA_VIEW_WIDTH);
  const [shipCatalogue, setShipCatalogue] = useState<PublicShipCatalogue | undefined>(undefined);
  const [maintenance, setMaintenance] = useState<MaintenanceState | undefined>(undefined);
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
    world:
      view?.game == null
        ? undefined
        : {
            shooter: { x: view.game.spaceship.x, y: view.game.spaceship.y },
            targets: view.game.enemyShips,
            obstacles: view.game.obstacles,
            cannonReach: view.game.cannon.reach,
            turretAngle: view.game.turretAngle,
            heading: view.game.spaceship.heading,
            turretMountedOnHull: view.game.helm.turretMountedOnHull,
            headingDeadbandRadians: view.game.helm.headingDeadbandRadians,
            headingFilterSeconds: view.game.helm.headingFilterSeconds,
            turretLeadRadians: view.game.helm.turretLeadRadians
          },
    roomId: view?.roomId ?? "",
    playerId: roomReference.current?.sessionId ?? "",
    runNumber: view?.runNumber ?? 0,
    generation: `${String(view?.runNumber ?? 0)}:${String(connectionEpoch)}`,
    send: (type, payload) => {
      roomReference.current?.send(type, payload);
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
   * A refusal belongs to the moment it happened. Left on screen it outlives the
   * phase that caused it and reads as a broken control, which is exactly how
   * one stale line made the upgrade cards look dead.
   */
  const encounterPhase = view?.game?.encounter.phase;
  useEffect(() => {
    setError("");
  }, [encounterPhase]);

  /* The snapshot cost is published on its own beat, so it is shown even when the
     byte counter could not attach to a socket. */
  useEffect(() => {
    if (!diagnostics) return undefined;
    /*
     * Rolls the windows and nothing else.
     *
     * There is no state here on purpose: a sample that re-rendered the page
     * would be an instrument paying for itself four times a second, and the
     * panel pulls these on its own beat.
     */
    const longTasks = attachLongTaskMeter(() => performance.now());
    const timer = window.setInterval(() => {
      const now = performance.now();
      snapshotCost.current = advanceWork(snapshotCost.current, now);
      commitCost.current = advanceWork(commitCost.current, now);
      longTasksReference.current = longTasks.read(now);
    }, 500);
    return () => {
      window.clearInterval(timer);
      longTasks.detach();
    };
  }, [diagnostics]);

  /*
   * The byte counter, and only when the panel was asked for. It hooks the live
   * socket rather than the SDK, so it has to be re-read as connections come and
   * go - the probe follows the socket across a reconnect on its own, and the
   * connection epoch is what brings a whole new room here.
   */
  useEffect(() => {
    if (!diagnostics) return undefined;
    const probe = attachTrafficMeter(
      () => {
        // The socket itself, not the SDK transport around it: the transport has
        // no listeners to add, and everything the room sends passes through the
        // socket's own `send`.
        const connection = roomReference.current?.connection as
          { transport?: { ws?: unknown } } | undefined;
        return connection?.transport?.ws;
      },
      () => performance.now()
    );

    if (probe === undefined) {
      // Undefined stands for "never attached", which the panel says in words.
      trafficReference.current = undefined;
      return undefined;
    }
    // Twice a second: the numbers are read, not watched, and a byte counter
    // driving a React render at frame rate would be an instrument that costs
    // the very thing it measures.
    const timer = window.setInterval(() => {
      trafficReference.current = probe.read(performance.now());
    }, 500);
    return () => {
      window.clearInterval(timer);
      probe.detach();
    };
  }, [diagnostics, connectionEpoch, status]);

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

  useEffect(() => {
    let cancelled = false;
    void import("./game/SpaceshipRuntime.js").then(() => {
      if (!cancelled) setWorldReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const streaming = cockpitPlayer !== undefined && view?.game?.encounter.phase === "combat";
  useShipPrediction({
    room: roomReference.current,
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
    world:
      view?.game == null
        ? undefined
        : {
            drive: view.game.drive,
            worldWidth: view.game.worldWidth,
            worldHeight: view.game.worldHeight,
            arenaRadius: view.game.arenaRadius,
            turretMountedOnHull: view.game.helm.turretMountedOnHull
          },
    onDriver: (driver) => {
      predictionDriverReference.current = driver;
    },
    onPending: (pending, driftEma) => {
      pendingInputReference.current = pending;
      driftReference.current = driftEma;
    },
    onDelay: (delayMs, intervalMs) => {
      playbackDelayReference.current = delayMs;
      patchIntervalReference.current = intervalMs;
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
    () => (view === undefined ? "" : createControllerJoinUrl(controllerUrl, view.roomId)),
    [view]
  );
  // Which tree the crew is walking: this run's hull out of the catalogue, or
  // the fixture when the preview has no server to ask.
  const runHull = shipCatalogue?.ships.find((ship) => ship.id === view?.shipArchetypeId);
  const moduleTree =
    runHull !== undefined
      ? { tiers: runHull.tiers, endlessTier: runHull.endlessTier }
      : previewView === undefined
        ? undefined
        : { tiers: PREVIEW_MODULE_TIERS, endlessTier: PREVIEW_ENDLESS_TIER };

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

  // Asked repeatedly, unlike the hull catalogue: a window can be announced
  // while a crew is still deciding on the create screen, and the countdown has
  // to move once it has. Only while no room is open -- inside one the room's
  // own state carries it.
  useEffect(() => {
    if (status === "connected") return undefined;
    const controller = new AbortController();
    const poll = (): void => {
      void fetchMaintenance(gameServerUrl, controller.signal).then((state) => {
        if (!controller.signal.aborted) setMaintenance(state);
      });
    };
    poll();
    const timer = setInterval(poll, 15_000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [status]);

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

  /**
   * The world as of the newest patch, for the scene to pull.
   *
   * Stable across renders on purpose: the scene is handed this once and calls
   * it every frame, so a new function each render would be a new subscription
   * each render.
   */
  const readLiveGame = useCallback(() => liveViewReference.current?.game ?? undefined, []);

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

  /** The three numbers the corner readout shows, pulled rather than pushed. */
  const readFrameStats = useCallback(
    () => ({
      fps: frameStatsReference.current.fps,
      worstFrameMs: frameStatsReference.current.worstFrameMs,
      stutterShare: frameStatsReference.current.stutterShare
    }),
    []
  );

  /*
   * The heat gauges, moved without a render.
   *
   * Twenty times a second, straight onto the nodes React drew once. Heat is the
   * fastest thing on the screen and every commit it used to cause was a DOM
   * write inside a frame the arena was drawing - which a trace of the long
   * frames shows as layout and paint the short frames never carry.
   */
  useEffect(() => {
    const timer = window.setInterval(() => {
      const game = liveViewReference.current?.game;
      const shell = shellReference.current;
      if (game != null && shell !== null) writeLiveHeat(shell, game);
    }, LIVE_HEAT_INTERVAL_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const readDiagnostics = useCallback(
    () => ({
      ...frameStatsReference.current,
      sceneMsPerSecond: frameStatsReference.current.updateMsPerSecond,
      worstSceneMs: frameStatsReference.current.worstUpdateMs,
      serverStepMs: liveViewReference.current?.game?.serverStepMs ?? 0,
      pingMs: liveViewReference.current?.displayLatencyMs ?? 0,
      entityCount:
        liveViewReference.current?.game == null
          ? 0
          : countDrawnEntities(liveViewReference.current.game),
      playbackDelayMs: playbackDelayReference.current,
      patchIntervalMs: patchIntervalReference.current,
      pendingInput: pendingInputReference.current,
      drift: driftReference.current,
      traffic: trafficReference.current,
      longTasks: longTasksReference.current,
      tickHz: SIMULATION_TICK_RATE,
      patchHz: Math.round(1000 / PATCH_INTERVAL_MS),
      snapshot: snapshotCost.current,
      commit: commitCost.current,
      components: readComponentCosts(performance.now())
    }),
    []
  );

  /** The seat this page holds when it is also the pilot. */
  const cockpitSeat =
    cockpitPlayer === undefined
      ? undefined
      : view?.players.find((player) => player.playerId === roomReference.current?.sessionId);

  /**
   * The cockpit's vote. Optimism and revisions are the controller's problem to
   * repeat: the room deduplicates on `actionId` and keeps the accepted revision
   * per role, so a retry is safe and a stale number is refused rather than
   * double-charged.
   */
  function sendCockpitVote(upgradeId: UpgradeId): void {
    const room = roomReference.current;
    const offer = view?.game?.teamUpgrade.offer;
    if (room === undefined || view === undefined || cockpitSeat === undefined || offer == null) {
      return;
    }
    const accepted = view.game?.teamUpgrade.votes[cockpitSeat.role]?.revision ?? 0;
    const revision = nextVoteRevision(accepted, cockpitVoteRevision.current);
    cockpitVoteRevision.current = revision;
    room.send(clientMessage.upgradeVote, {
      protocolVersion: PROTOCOL_VERSION,
      roomId: view.roomId,
      playerId: cockpitSeat.playerId,
      runNumber: view.runNumber,
      actionId: createActionId(),
      waveNumber: offer.waveNumber,
      offerId: offer.offerId,
      upgradeId,
      revision
    });
  }

  function sendCockpitReady(): void {
    const room = roomReference.current;
    if (room === undefined || view === undefined || cockpitSeat === undefined) return;
    room.send(clientMessage.ready, {
      protocolVersion: PROTOCOL_VERSION,
      roomId: view.roomId,
      playerId: cockpitSeat.playerId,
      runNumber: view.runNumber
    });
    // Fullscreen is not asked for here: the card already carries the button,
    // and this screen's helper toggles rather than requests, so a player who
    // went fullscreen first would be thrown back out by pressing Готов.
  }

  async function createRoom(
    crewSize: CrewSize,
    shipArchetypeId: string | undefined,
    startWave: number,
    cockpitPlayerName?: string
  ): Promise<void> {
    statusReference.current = "connecting";
    setStatus("connecting");
    setError("");
    setClosingRoom(false);
    setCockpitPlayer(cockpitPlayerName);
    cockpitPlayerReference.current = cockpitPlayerName;
    try {
      const room = await new Client(gameServerUrl).create<NetworkRoomState>(ROOM_TYPE, {
        // One connection with both duties when this device is also the pilot.
        // The two shapes differ in what they name, so the seat count only
        // travels with the display form.
        ...(cockpitPlayerName === undefined
          ? { role: "display" as const, crewSize }
          : { role: "solo" as const, playerName: cockpitPlayerName }),
        protocolVersion: PROTOCOL_VERSION,
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
      /*
       * The refusals the room sends back. The display never listened for these
       * — it had nothing to send and so nothing to be refused — and the cockpit
       * inherited that silence: every rejected packet went to a channel with no
       * handler, and the ship simply did not move, with the reason sitting one
       * unregistered listener away.
       */
      room.onMessage(serverMessage.error, (payload: unknown) => {
        const parsed = serverErrorSchema.safeParse(payload);
        const reason = parsed.success ? parsed.data.code : "unknown";
        /*
         * `invalid_phase` on the continuous streams is expected and means
         * nothing: a packet in flight when the wave ends lands after the room
         * has left combat, and the room says so. Painting that on screen — and
         * never clearing it — turned a transient into a banner that sat over
         * the intermission reading "Gameplay input requires combat", which is
         * why the upgrade cards looked broken when they were not.
         */
        // Always in the console: a refusal nobody can see is what turned this
        // into three rounds of guessing. Only the banner is filtered.
        console.warn(`Room refused a command: ${reason}`);
        if (reason === "invalid_phase") return;
        if (cockpitPlayerReference.current !== undefined) {
          setError(parsed.success ? parsed.data.message : "Команда отклонена.");
        }
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
        statusReference.current = "reconnecting";
        setStatus("reconnecting");
        setError("Связь прервана. Восстанавливаем общий экран…");
        setConnectionEpoch((value) => value + 1);
      });
      room.onReconnect(() => {
        if (roomReference.current !== room) return;
        statusReference.current = "connected";
        setStatus("connected");
        setError("");
      });
      room.onError((_code, message) => {
        if (roomReference.current !== room) return;
        statusReference.current = "error";
        setStatus("error");
        setError(message ?? "Сервер сообщил об ошибке.");
      });
      room.onLeave(() => {
        if (roomReference.current !== room) return;
        roomReference.current = undefined;
        resetToCreate("Комната закрыта. Создайте новую сессию.");
      });
    } catch (reason) {
      statusReference.current = "error";
      setStatus("error");
      setError(createFailureMessage(reason));
    }
  }

  /**
   * Hands a view to React, and remembers when.
   *
   * Separate from deciding whether to: the trailing timer has to run the same
   * publish the patch would have run.
   */
  function publishView(view: DisplayRoomView, now: number): void {
    if (publishTimerReference.current !== undefined) {
      window.clearTimeout(publishTimerReference.current);
      publishTimerReference.current = undefined;
    }
    const rootFollows = needsRootRender(publishedViewReference.current, view);
    publishedViewReference.current = view;
    publishedAtReference.current = now;
    // The panels already have it; the tree above them re-renders only when the
    // shape of the page changed.
    if (rootFollows) setNetworkView(view);
  }

  function applyRoomState(state: NetworkRoomState): void {
    // The flatten and the schema parse, timed together: they are what stands
    // between a patch arriving and React being told about it, and on a phone
    // that is the work landing twenty times a second.
    const startedAt = performance.now();
    /*
     * A patch the contract refuses must not stop the world.
     *
     * The parse throws, and an exception out of a state callback takes the page
     * with it: the world stands still while a locally predicted ship flies on,
     * which is what a frozen screen has twice turned out to be. Keeping the last
     * good view is a worse picture than the newest one and an incomparably
     * better one than none, and the count says the picture is stale rather than
     * letting it look merely quiet.
     */
    let next: DisplayRoomView | undefined;
    try {
      next = toDisplayRoomView(state);
    } catch (reason) {
      refusedPatchesReference.current += 1;
      if (refusedPatchesReference.current === 1) {
        console.error("A patch did not match the display contract; holding the last one.", reason);
      }
      return;
    }
    const builtInMs = performance.now() - startedAt;
    if (next === undefined) return;
    snapshotCost.current = recordWork(snapshotCost.current, builtInMs, startedAt);
    // The scene gets it now, whatever the page does: it draws from this
    // reference every frame, and a shell that waited for a React commit would
    // appear late for exactly as long as the commit was deferred.
    liveViewReference.current = next;
    /*
     * Straight into the store, on the patch rather than on the page's slower
     * publish clock. A panel subscribed to a slice pays only when that slice
     * moves, so there is nothing to coalesce for it - and the throttle below
     * exists for the tree that still re-renders whole, not for them.
     */
    publishWorld(next);
    // Published from here rather than from a render: the Node bot reading it
    // steers on what it sees, and it must not inherit the page's slow clock.
    if (visibleDemo && next.game !== null) {
      publishVisibleDemoWorld(globalThis, buildVisibleDemoWorld(next.game, Date.now()));
    }
    /*
     * Only on the way in, not on every patch.
     *
     * Setting a state to the value it already holds is not free: React renders
     * the component once more before it bails out, and this one is the root -
     * so a call meant for the moment a connection comes up was re-rendering the
     * whole page twenty-six times a second, and every battle panel with it. It
     * measured as the two dearest panels on the screen and it was neither.
     */
    if (statusReference.current !== "connected") {
      statusReference.current = "connected";
      setStatus("connected");
    }

    /*
     * The page commits on its own clock.
     *
     * Anything a hand is waiting for goes straight through; the rest coalesces,
     * because a tree rebuilt twenty times a second cost a phone seventy
     * milliseconds of every one, in commits whose worst was half a frame - and
     * the numbers in it are not readable at that rate anyway.
     */
    const now = performance.now();
    if (hasImmediateChange(publishedViewReference.current, next)) {
      publishView(next, now);
      return;
    }
    const due = publishedAtReference.current + PASSIVE_PUBLISH_MS - now;
    if (due <= 0) {
      publishView(next, now);
      return;
    }
    // Nothing is dropped: the last state always lands, just later.
    if (publishTimerReference.current !== undefined) return;
    publishTimerReference.current = window.setTimeout(() => {
      publishTimerReference.current = undefined;
      const latest = liveViewReference.current;
      if (latest !== undefined) publishView(latest, performance.now());
    }, due);
  }

  function resetToCreate(message: string): void {
    liveViewReference.current = undefined;
    publishedViewReference.current = undefined;
    publishWorld(undefined);
    setNetworkView(undefined);
    statusReference.current = "idle";
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
            commitCost.current = recordWork(commitCost.current, actualDuration, performance.now());
          }}
        >
          <section id="game-canvas" className="game-stage" aria-label="Космическое поле боя">
            <MeteredPanel id="шапка" measuring={diagnostics}>
              {interfaceEnabled && <BattleHudPanel />}
            </MeteredPanel>
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
                  backgroundEnabled={backgroundEnabled}
                  glowEnabled={glowEnabled}
                  vectorsEnabled={vectorsEnabled}
                  onFrameStats={(stats) => {
                    frameStatsReference.current = stats;
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
                  onTogglePrediction={() => {
                    setPredictionEnabled((enabled) => !enabled);
                  }}
                  backgroundEnabled={backgroundEnabled}
                  onToggleBackground={() => {
                    setBackgroundEnabled((enabled) => !enabled);
                  }}
                  glowEnabled={glowEnabled}
                  onToggleGlow={() => {
                    setGlowEnabled((enabled) => !enabled);
                  }}
                  vectorsEnabled={vectorsEnabled}
                  onToggleVectors={() => {
                    setVectorsEnabled((enabled) => !enabled);
                  }}
                  interfaceEnabled={interfaceEnabled}
                  onToggleInterface={() => {
                    setInterfaceEnabled((enabled) => !enabled);
                  }}
                  opaquePanels={opaquePanels}
                  onToggleOpaquePanels={() => {
                    setOpaquePanels((opaque) => !opaque);
                  }}
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

function createFailureMessage(reason: unknown): string {
  if (!(reason instanceof Error)) return "Не удалось создать комнату.";
  if (reason.message === ROOM_REFUSED_FOR_MAINTENANCE) {
    return "На сервере технические работы. Новые комнаты пока не создаются.";
  }
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
