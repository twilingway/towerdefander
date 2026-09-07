import { Client, type Room } from "@colyseus/sdk";
import type { MaintenanceState } from "@spaceship-defender/protocol";
import {
  CAMERA_VIEW_ASPECT,
  CAMERA_VIEW_WIDTH_MAX,
  CAMERA_VIEW_WIDTH_MIN,
  MAX_START_WAVE,
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
  roleLabel,
  type PreviewPhase
} from "@spaceship-defender/client-shared";
import {
  Profiler,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode
} from "react";

import { BossHealth } from "./BossHealth.js";
import { CombatRadar } from "./CombatRadar.js";
import { CrewLatency } from "./components/CrewLatency/index.js";
import { useLetterboxBars } from "./useLetterboxBars.js";
import { FpsReadout } from "./components/FpsReadout/index.js";
import { LobbyLayout } from "./components/LobbyLayout/index.js";
import { encounterLabel } from "./model/labels.js";
import { CreateRoomScreen } from "./screens/CreateRoomScreen/index.js";
import { countDrawnEntities, getCurrentWaveUpgrade } from "./combatHudViewModel.js";
import { WeaponHeat } from "./WeaponHeat.js";
import { RotateNotice, useIsPortrait } from "./components/RotateNotice/index.js";
import { SoloCockpit } from "./screens/SoloCockpit/index.js";
import { useSoloCockpit } from "./model/hooks/useSoloCockpit.js";
import { useCockpitKeyboard } from "./model/hooks/useCockpitKeyboard.js";
import { readAimAssistFromDevice, saveAimAssistToDevice } from "./model/aimAssistPreference.js";
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
import { DiagnosticsPanel } from "./components/DiagnosticsPanel/index.js";
import { MaintenanceNotice } from "./components/MaintenanceNotice/index.js";
import { ModuleTreeWindow } from "./components/ModuleTreeWindow/index.js";
import { createControllerJoinUrl, toDisplayRoomView, type NetworkRoomState } from "./roomView.js";
import { fetchMaintenance } from "./serverStatus.js";
import { fetchShipCatalogue } from "./shipCatalogue.js";
import { isDiagnosticsRequested } from "./model/diagnostics.js";
import { useShipPrediction } from "./model/hooks/useShipPrediction.js";
import type { PredictedPoseFrame } from "./model/shipPrediction.js";
import { advanceWork, createWorkMeter, recordWork, type WorkMeter } from "./model/workMeter.js";
import { attachTrafficMeter, type TrafficMeter } from "./model/trafficMeter.js";
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
  const [networkView, setNetworkView] = useState<DisplayRoomView>();
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
  const [frameStats, setFrameStats] = useState({
    fps: 0,
    worstFrameMs: 0,
    stutterShare: 0,
    updateMsPerSecond: 0,
    worstUpdateMs: 0
  });
  /**
   * Off means the ship is drawn from the authoritative angles alone. The point
   * of the switch is that it compares the two on one connection and one tick;
   * comparing two sessions would compare two networks instead.
   */
  const [predictionEnabled, setPredictionEnabled] = useState(true);
  /**
   * The ship this page is flying, as the reconciler currently has it.
   *
   * A ref, and that is the whole point: it is written every animation frame,
   * and a state update at that rate re-renders the battle tree a hundred times
   * a second. The scene reads it directly instead, which is also how the patch
   * stops being a reason to redraw the interface at all.
   */
  const predictedPoseReference = useRef<PredictedPoseFrame | undefined>(undefined);
  /** Written every frame, read twice a second by the panel; never a render. */
  const pendingInputReference = useRef(0);
  const driftReference = useRef(0);
  const [pendingInput, setPendingInput] = useState(0);
  const [drift, setDrift] = useState(0);
  /**
   * The parallax layers, asked about rather than settled: they are four
   * full-screen sprites and three blends, and a phone is where that is paid for.
   */
  const [backgroundEnabled, setBackgroundEnabled] = useState(true);
  /** The shield's bloom, the other visual worth pricing on the device. */
  const [glowEnabled, setGlowEnabled] = useState(true);
  /** The five overlays the scene rebuilds every frame; the lab has none of these. */
  const [vectorsEnabled, setVectorsEnabled] = useState(true);
  const [traffic, setTraffic] = useState<TrafficMeter | undefined>(undefined);
  /*
   * Written on every patch and read twice a second. A ref rather than state:
   * setting state here would add a render to the very work being measured.
   */
  const snapshotCost = useRef(createWorkMeter());
  const [snapshotReading, setSnapshotReading] = useState<WorkMeter | undefined>(undefined);
  /*
   * What React itself costs, from React's own stopwatch rather than a guess.
   * Every patch replaces the view object, so the whole battle tree re-renders
   * with it, and the number of long frames on a phone matches the number of
   * patches almost exactly - which makes this the last unmeasured suspect.
   */
  const commitCost = useRef(createWorkMeter());
  const [commitReading, setCommitReading] = useState<WorkMeter | undefined>(undefined);
  const shellReference = useRef<HTMLElement>(null);
  const [previewCameraViewWidth, setPreviewCameraViewWidth] = useState(PREVIEW_CAMERA_VIEW_WIDTH);
  const [shipCatalogue, setShipCatalogue] = useState<PublicShipCatalogue | undefined>(undefined);
  const [maintenance, setMaintenance] = useState<MaintenanceState | undefined>(undefined);
  // Layout preview feeds the same view the network fills, so the HUD, overlays
  // and the Phaser frame all render through the production path.
  const previewView = useMemo(
    () => (preview ? createPreviewRoomView(previewPhase, previewCameraViewWidth) : undefined),
    [preview, previewPhase, previewCameraViewWidth]
  );
  const view = previewView ?? networkView;
  /*
   * Hooks cannot hide behind a branch, so the cockpit's wire half is always
   * mounted and simply has nothing to send until this page is also the pilot.
   * The generation is the controller's own recipe — a new run or a new
   * connection restarts the sequences the room watermarks.
   */
  const cockpitControls = useSoloCockpit({
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
    predicting: predictionEnabled,
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
    const timer = window.setInterval(() => {
      const now = performance.now();
      setPendingInput(pendingInputReference.current);
      setDrift(driftReference.current);
      snapshotCost.current = advanceWork(snapshotCost.current, now);
      commitCost.current = advanceWork(commitCost.current, now);
      setSnapshotReading(snapshotCost.current);
      setCommitReading(commitCost.current);
    }, 500);
    return () => {
      window.clearInterval(timer);
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
      setTraffic(undefined);
      return undefined;
    }
    // Twice a second: the numbers are read, not watched, and a byte counter
    // driving a React render at frame rate would be an instrument that costs
    // the very thing it measures.
    const timer = window.setInterval(() => {
      setTraffic(probe.read(performance.now()));
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
  const predicting =
    predictionEnabled && cockpitPlayer !== undefined && view?.game?.encounter.phase === "combat";
  useShipPrediction({
    room: roomReference.current,
    enabled: predicting,
    source: {
      readIntent: () => cockpitControls.readIntent(),
      enabled: predicting
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
    onPose: (pose) => {
      predictedPoseReference.current = pose;
    },
    onPending: (pending, driftEma) => {
      pendingInputReference.current = pending;
      driftReference.current = driftEma;
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
    // The flatten and the schema parse, timed together: they are what stands
    // between a patch arriving and React being told about it, and on a phone
    // that is the work landing twenty times a second.
    const startedAt = performance.now();
    const next = toDisplayRoomView(state);
    const builtInMs = performance.now() - startedAt;
    if (next !== undefined) {
      snapshotCost.current = recordWork(snapshotCost.current, builtInMs, startedAt);
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

  const waveUpgrade =
    view.game === null
      ? null
      : getCurrentWaveUpgrade(view.game.teamUpgrade.selection, view.game.encounter.waveNumber);
  // Only the rocks that came with the wave pay credits, so those are the ones
  // worth counting next to the score.
  const waveAsteroidCount =
    view.game?.asteroids.filter(({ origin }) => origin === "wave").length ?? 0;

  return (
    <main
      ref={shellReference}
      className={`display-shell ${view.game === null ? "" : "display-shell--battle"}${cockpitPlayer === undefined ? "" : " display-shell--cockpit"}`}
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
          {view.game !== null && !diagnostics && (
            <FpsReadout
              fps={frameStats.fps}
              worstFrameMs={frameStats.worstFrameMs}
              stutterShare={frameStats.stutterShare}
            />
          )}
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
                onReady: sendCockpitReady
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
            {portrait ? (
              <RotateNotice />
            ) : (
              <SpaceshipCanvas
                game={view.game}
                readPredictedPose={() => (predicting ? predictedPoseReference.current : undefined)}
                runNumber={view.runNumber}
                connectionEpoch={connectionEpoch}
                visibleDemo={visibleDemo}
                backgroundEnabled={backgroundEnabled}
                glowEnabled={glowEnabled}
                vectorsEnabled={vectorsEnabled}
                onFrameStats={setFrameStats}
              />
            )}
            {cockpitPlayer !== undefined && !portrait && (
              <SoloCockpit
                enabled={view.game.encounter.phase === "combat"}
                driveDeadzoneShare={view.game.helm.driveDeadzoneShare}
                aimDeadzoneShare={view.game.helm.aimDeadzoneShare}
                machineGunHeat={view.game.machineGun.heat / view.game.machineGun.capacity}
                machineGunOverheated={view.game.machineGun.overheated}
                cannonHeat={view.game.cannon.heat / view.game.cannon.capacity}
                cannonOverheated={view.game.cannon.overheated}
                aimAssist={aimAssist}
                onAimAssistChange={(next) => {
                  setAimAssist(next);
                  saveAimAssistToDevice(next);
                }}
                {...cockpitControls}
              />
            )}
            {view.game.encounter.phase === "combat" &&
              (view.game.encounter.lootWindowSecondsRemaining > 0 ? (
                <SalvageCountdown
                  secondsRemaining={view.game.encounter.lootWindowSecondsRemaining}
                />
              ) : (
                <WaveCountdown
                  className="display-wave-countdown"
                  secondsRemaining={view.game.encounter.waveSecondsRemaining}
                />
              ))}
            {view.game.encounter.phase === "combat" && <BossHealth game={view.game} />}
            {diagnostics && (
              <DiagnosticsPanel
                fps={frameStats.fps}
                worstFrameMs={frameStats.worstFrameMs}
                stutterShare={frameStats.stutterShare}
                sceneMsPerSecond={frameStats.updateMsPerSecond}
                worstSceneMs={frameStats.worstUpdateMs}
                serverStepMs={view.game.serverStepMs}
                pingMs={view.displayLatencyMs}
                entityCount={countDrawnEntities(view.game)}
                traffic={traffic}
                snapshot={snapshotReading}
                commit={commitReading}
                pendingInput={pendingInput}
                drift={drift}
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
              />
            )}
            <CombatRadar game={view.game} />
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
            {moduleTree !== undefined && (
              <ModuleTreeWindow
                tiers={moduleTree.tiers}
                endlessTier={moduleTree.endlessTier}
                purchased={view.game.purchasedModules}
                initiallyShown={previewView !== undefined}
                ship={{
                  maxHp: view.game.spaceship.maxHp,
                  shieldCapacity: view.game.shield.capacity,
                  shieldArcRadians: view.game.shield.arcHalfAngle * 2,
                  shieldRadius: view.game.shieldRadius
                }}
              />
            )}
            {/*
            Stacked directly under the instrument panel and answering the same
            question, so with the panel open it is the third ping on one edge of
            the screen. The panel wins; the crew rows come back the moment the
            flag goes away.
          */}
            {!diagnostics && <CrewLatency view={view} game={view.game} />}
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
