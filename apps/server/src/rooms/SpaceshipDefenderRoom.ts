/**
 * Over the 500-line ceiling on purpose. What could move out has moved: the state
 * mirror, latency, lifecycle deadlines, the upgrade journal, decorations and the
 * run seed all live in sibling modules. What is left is one Colyseus surface -
 * the lifecycle hooks, the message table and the handlers behind it - and those
 * share `this.clock`, `this.state` and `this.disposing` too closely to split
 * without turning the room into objects that call each other back. Splitting it
 * further would move authority around rather than clarify it.
 */
import {
  advanceSpaceshipSimulation,
  applyGunnerInput,
  applyPilotInput,
  applyShieldInput,
  cancelGunnerControl,
  cancelPilotControl,
  cancelShieldControl,
  createCleanSpaceshipRun,
  createSpaceshipSimulationConfig,
  failWaveByTimeout,
  type SpaceshipSimulationConfig,
  type SpaceshipSimulationState,
  voteForTeamUpgrade
} from "@spaceship-defender/game-core";
import {
  CREW_ROLES,
  PLAYER_CAPACITY,
  PATCH_INTERVAL_MS,
  PROTOCOL_VERSION,
  ROOM_REFUSED_AT_CAPACITY,
  ROOM_REFUSED_FOR_MAINTENANCE,
  SOLO_INPUT_BUFFER_SIZE,
  SOLO_INPUT_RANGES,
  SoloInput,
  clientMessage,
  clientLatencyPongSchema,
  roomCreateOptionsSchema,
  gunnerInputCommandSchema,
  joinOptionsSchema,
  pilotInputCommandSchema,
  readyCommandSchema,
  serverMessage,
  shieldInputCommandSchema,
  upgradeVoteCommandSchema,
  type CrewRole,
  type GunnerInputCommand,
  type PilotInputCommand,
  type RoomClosingReason,
  type ServerErrorCode,
  type ShieldInputCommand
} from "@spaceship-defender/protocol";
import { StateView } from "@colyseus/schema";
import { CloseCode, ErrorCode, Room, ServerError, matchMaker, type Client } from "colyseus";
import { randomUUID } from "node:crypto";

import { getBalanceStore } from "../balance/index.js";
import { getMaintenanceWindow } from "../maintenance/index.js";
import { readServerConfig } from "../config.js";
import type { RoomStatsMetadata, RoomStatsStatus } from "../stats/types.js";
import { DECORATION_REFERENCE_WORLD, DECORATIVE_OBSTACLES } from "./decorations.js";
import { holdSparringStand, openSparringStand } from "./sparringStand.js";
import { SIMULATION_TICK_RATE } from "@spaceship-defender/game-core";
import { createRunSeed } from "./runSeed.js";
import { LatencyTracker, type RoomTimer } from "./latencyTracker.js";
import { LifecycleSchedule } from "./lifecycleSchedule.js";
/*
 * The crew policy, in plain JavaScript beside this file, with its shapes in
 * `crewPolicy.d.mts`. One policy runs the bot everywhere: this room drives an
 * unmanned seat with it, and the measurement harness plays whole runs with it.
 * Before this there were two, and the same defect had to be found twice.
 */
import {
  createAutopilotMemory,
  leadSpeedFor,
  planShield,
  resolveAutopilotProfile
} from "./crewPolicy.mjs";
import type { PolicyMemory, PolicyOptions } from "./crewPolicy.d.mts";
import type { AutopilotProfile } from "@spaceship-defender/protocol";
import { buildCrewWorld, POLICY_TICK_MS } from "./crewWorld.js";
import { projectGameState } from "./stateProjection.js";
import {
  upgradeErrorMessage,
  upgradeFingerprint,
  type UpgradeJournalEntry
} from "./upgradeJournal.js";
import {
  DISPLAY_VIEW_TAG,
  EnemyVisualState,
  ObstacleState,
  PlayerState,
  SpaceshipDefenderState
} from "./SpaceshipDefenderState.js";

/**
 * What a connection is doing here. `solo` is both of the others at once: it
 * draws the world and holds a seat, so every branch on this type has to name
 * it explicitly rather than fall into an `else`.
 */
type ConnectionRole = "display" | "controller" | "solo";
type InputMessageType =
  | typeof clientMessage.pilotInput
  | typeof clientMessage.gunnerInput
  | typeof clientMessage.shieldInput;

interface RuntimeSchema<T> {
  safeParse(input: unknown): { success: true; data: T } | { success: false };
}

const MAX_UPGRADE_JOURNAL_ENTRIES = 32;

const {
  reconnectionGraceSeconds,
  lobbyTtlSeconds,
  resultTtlSeconds,
  zeroControllerTtlSeconds,
  waveTtlSeconds,
  absoluteTtlSeconds,
  allowStartWave,
  sparringEnemies,
  maxConcurrentRooms
} = readServerConfig();

const spaceshipSimulationConfig = createSpaceshipSimulationConfig();

/**
 * What a seat may send, and Colyseus force-closes a client that crosses it.
 *
 * A crew panel sends one continuous stream capped at twenty a second, plus room
 * for ready, votes and latency pongs. A cockpit is different in kind: it holds
 * an acknowledged input stream, one frame per simulation step, so its floor is
 * the tick rate itself - sixty a second - and the headroom above that is for
 * everything else the seat does. Set below the tick rate this closes the
 * connection of a player doing nothing wrong, which shows on screen as the
 * world freezing while a locally predicted ship flies on.
 */
const CREW_MESSAGE_CEILING = 25;
const SOLO_MESSAGE_CEILING = SIMULATION_TICK_RATE + 30;
/**
 * Head room between the end of the salvage window and the wave deadline it
 * pushes: the window closes on a simulation tick, the deadline on a host timer,
 * and the deadline must never be the one that lands first.
 */
const SALVAGE_DEADLINE_SLACK_MS = 2_000;

export class SpaceshipDefenderRoom extends Room<{
  state: SpaceshipDefenderState;
  metadata: RoomStatsMetadata;
}> {
  override maxMessagesPerSecond = CREW_MESSAGE_CEILING;

  /**
   * The solo cockpit's own input stream.
   *
   * A stream rather than a message because prediction needs a sequence the
   * library acknowledges: the client replays every frame past the one the room
   * has applied, and it has to be told which that is. Crew panels keep their
   * three messages - they have no ship of their own to replay.
   *
   * `sanitize` clamps in place before anything reads a frame. Not anti-cheat -
   * the room still owns every outcome - but NaN containment: one NaN reaching
   * the step poisons the ship's position permanently and it vanishes with no
   * error anywhere.
   */
  private readonly soloInputs = this.defineInput(SoloInput, {
    bufferMaxSize: SOLO_INPUT_BUFFER_SIZE,
    seqField: "seq",
    sanitize: SOLO_INPUT_RANGES
  });

  private readonly connectionRoles = new Map<string, ConnectionRole>();
  private readonly sequenceWatermarks = new Map<string, Map<InputMessageType, number>>();
  private readonly connectionClients = new Map<string, Client>();
  private readonly latency = new LatencyTracker({
    sendProbe: (sessionId, probeId) => {
      this.connectionClients
        .get(sessionId)
        ?.send(serverMessage.latencyProbe, { protocolVersion: PROTOCOL_VERSION, probeId });
    },
    schedule: (callback, delayMs) => this.clock.setTimeout(callback, delayMs),
    publish: (sessionId, latencyMs) => {
      this.publishLatency(sessionId, latencyMs);
    },
    now: () => performance.now()
  });
  private readonly upgradeJournals = new Map<string, UpgradeJournalEntry[]>();
  private displaySessionId: string | undefined;
  private gameConfig: SpaceshipSimulationConfig = spaceshipSimulationConfig;
  /**
   * What the bot on an unmanned seat remembers and is tuned to, fixed for the
   * run the way the config and the helm are: a console edit lands on the next
   * run, not on the one being played.
   */
  private crewMemory: PolicyMemory = createAutopilotMemory();
  private crewProfile: AutopilotProfile | undefined;
  private crewOptions: PolicyOptions = {};
  /** Whether the armed loop advances the fight or idles through it. */
  private simulationRunning = false;
  private gameState: SpaceshipSimulationState | undefined;
  /** Real time received from the loop that no whole fixed step has claimed yet. */
  /**
   * Cost of the last simulation step alone, without the projection or the patch
   * that follow it. Measuring the whole tick would blend the three and leave
   * nothing to tell them apart afterwards; and when one wake runs several steps,
   * the price of one is the interesting number, not their sum.
   */
  private lastStepMs = 0;
  /**
   * The last solo frame this room actually applied.
   *
   * Published so the cockpit knows where its replay starts. Without it the
   * client has a local ship and no way to tell which of its own inputs the
   * server has already seen, which is the whole of reconciliation.
   */
  private appliedSoloSeq = 0;
  private readonly lifecycle = new LifecycleSchedule({
    schedule: (callback, delayMs) => this.clock.setTimeout(callback, delayMs),
    now: () => Date.now(),
    onExpired: (reason) => {
      this.disposeOnce(reason);
    },
    isDisposing: () => this.disposing
  });
  private waveDeadlineTimer: RoomTimer | undefined;
  private maintenanceTimer: RoomTimer | undefined;
  private waveDeadlineAtMs: number | undefined;
  private waveDeadlineGeneration = 0;
  private createdAtMs = 0;
  private status: RoomStatsStatus = "lobby";
  private statusChangedAtMs = 0;
  private firstControllerJoined = false;
  private disposing = false;
  /** Wave every run in this room opens on; 1 unless a tester asked otherwise. */
  private startWave = 1;
  private statsId = "";
  private pendingMetadata: RoomStatsMetadata | undefined;
  private metadataWritePromise: Promise<void> | undefined;

  override messages = {
    [clientMessage.ready]: (client: Client, payload: unknown) => {
      this.handleReady(client, payload);
    },
    [clientMessage.pilotInput]: (client: Client, payload: unknown) => {
      this.handlePilotInput(client, payload);
    },
    [clientMessage.gunnerInput]: (client: Client, payload: unknown) => {
      this.handleGunnerInput(client, payload);
    },
    [clientMessage.shieldInput]: (client: Client, payload: unknown) => {
      this.handleShieldInput(client, payload);
    },
    [clientMessage.upgradeVote]: (client: Client, payload: unknown) => {
      this.handleUpgradeVote(client, payload);
    },
    [clientMessage.latencyPong]: (client: Client, payload: unknown) => {
      this.handleLatencyPong(client, payload);
    }
  };

  override onCreate(unsafeOptions: unknown): void {
    /*
     * Assigned here rather than declared as class fields, and that is not a
     * style choice.
     *
     * `Room` installs `state` and `maxClients` as accessors on the instance in
     * its constructor: setting `state` is what builds the serializer's encoder,
     * and setting `maxClients` is what tells matchmaking. A class field is
     * defined, not assigned - it puts an own data property over the accessor and
     * neither setter ever runs. The room then has state with no encoder, which
     * on `@colyseus/schema` 5 means every view filter silently admits nothing:
     * the display would connect and receive no world at all.
     */
    this.state = new SpaceshipDefenderState();
    this.maxClients = PLAYER_CAPACITY + 2;
    this.armSimulationLoop();
    // Matchmaking forwards the message only for codes it recognises; anything
    // else reaches the client as a bare "Internal Server Error", and the join
    // screens match on this text to name the reason for the player.
    if (this.hasProtocolMismatch(unsafeOptions)) {
      throw new ServerError(ErrorCode.APPLICATION_ERROR, "protocol_mismatch");
    }
    /*
     * A solo cockpit creates its own room, so creation accepts either shape.
     * The two differ only in what they name: the display names a seat count,
     * the cockpit names a player and takes the seat count that solo means.
     */
    const options = roomCreateOptionsSchema.safeParse(unsafeOptions);
    if (!options.success) {
      throw new ServerError(ErrorCode.APPLICATION_ERROR, "invalid_message");
    }
    const crewSize = options.data.role === "solo" ? 1 : options.data.crewSize;
    // Every room in this process shares one event loop, so accepting a room past
    // the ceiling slows the tick of every room already running, not just the
    // newcomer. Refuse instead, and let the operator scale out. The count comes
    // from the matchmaker rather than a parallel tally, which cannot drift. It
    // does not yet include the room being created, so the comparison is `>=`.
    // Matchmaking only forwards the message for codes it knows; anything else
    // reaches the client as a bare "Internal Server Error".
    // A window is announced so the sessions already running can finish. New
    // ones must not start, or the drain never ends. Refused before the room
    // exists, like the ceiling below, so nothing already playing is touched.
    if (getMaintenanceWindow().isActive()) {
      throw new ServerError(ErrorCode.APPLICATION_ERROR, ROOM_REFUSED_FOR_MAINTENANCE);
    }
    if (matchMaker.stats.local.roomCount >= maxConcurrentRooms) {
      throw new ServerError(ErrorCode.APPLICATION_ERROR, ROOM_REFUSED_AT_CAPACITY);
    }
    this.state.roomId = this.roomId;
    this.state.crewSize = crewSize;
    // A hull the preset does not carry is refused rather than swapped for the
    // default: a crew that picked a ship must not be given another one silently.
    const tuning = getBalanceStore().getActiveTuning();
    const requestedHull = options.data.shipArchetypeId;
    if (requestedHull !== undefined && !Object.hasOwn(tuning.shipArchetypes, requestedHull)) {
      throw new ServerError(ErrorCode.APPLICATION_ERROR, "invalid_message");
    }
    this.state.shipArchetypeId = requestedHull ?? tuning.defaultShipArchetypeId;
    // A testing aid, so it is refused rather than honoured quietly: an operator
    // who sees waves being skipped on a public server should be able to find
    // out why from the log.
    const requestedWave = options.data.startWave;
    if (requestedWave !== undefined && requestedWave > 1) {
      if (allowStartWave) {
        this.startWave = requestedWave;
      } else {
        console.warn(
          `Ignoring startWave ${String(requestedWave)}: start ALLOW_START_WAVE=true to use it.`
        );
      }
    }
    this.maxMessagesPerSecond = crewSize === 1 ? SOLO_MESSAGE_CEILING : CREW_MESSAGE_CEILING;
    const now = Date.now();
    this.createdAtMs = now;
    this.statusChangedAtMs = now;
    this.statsId = randomUUID();
    this.lifecycle.set("lobby_expired", now + lobbyTtlSeconds * 1_000);
    this.lifecycle.set("room_lifetime_expired", now + absoluteTtlSeconds * 1_000);
    // Once a second, not once a tick: the countdown a player reads is in
    // seconds, and a lobby has no tick at all. Assigning an unchanged value
    // costs no patch, so a room with no window announced pays nothing.
    this.syncMaintenance();
    this.maintenanceTimer = this.clock.setInterval(() => {
      this.syncMaintenance();
    }, 1_000);
    this.queueMetadataUpdate();
  }

  private syncMaintenance(): void {
    const snapshot = getMaintenanceWindow().snapshot(Date.now());
    this.state.maintenanceActive = snapshot.active;
    this.state.maintenanceSecondsRemaining = snapshot.secondsRemaining;
  }

  override onJoin(client: Client, unsafeOptions: unknown): void {
    if (this.disposing) {
      throw new ServerError(ErrorCode.APPLICATION_ERROR, "invalid_phase");
    }
    const result = joinOptionsSchema.safeParse(unsafeOptions);
    if (!result.success) {
      throw new ServerError(
        ErrorCode.APPLICATION_ERROR,
        this.hasProtocolMismatch(unsafeOptions) ? "protocol_mismatch" : "invalid_message"
      );
    }

    if (result.data.role === "display") {
      this.joinDisplay(client);
      this.registerLatencyConnection(client);
      this.lifecycle.clear("display_reconnect_expired");
      this.updateStatusFromRoom();
      this.queueMetadataUpdate();
      return;
    }

    /*
     * One connection, both duties, and neither half may be half-applied. Both
     * refusals are checked before anything is written, because taking the seat
     * and then finding a display already connected leaves a room holding a
     * player nobody is behind. The refusals themselves are the ones the
     * separate paths already throw.
     */
    if (result.data.role === "solo") {
      if (this.displaySessionId !== undefined) {
        throw new ServerError(ErrorCode.APPLICATION_ERROR, "display_already_connected");
      }
      this.takeCrewSeat(client, result.data.playerName, "solo");
      this.joinDisplay(client, "solo");
      this.registerLatencyConnection(client);
      this.lifecycle.clear("display_reconnect_expired");
      this.updateStatusFromRoom();
      this.queueMetadataUpdate();
      return;
    }

    this.takeCrewSeat(client, result.data.playerName, "controller");
    this.registerLatencyConnection(client);
    this.queueMetadataUpdate();
  }

  /**
   * The controller half of joining: a seat on the roster, a clean watermark
   * map, and the clock that disposes a crewless room stopped. Shared with the
   * solo connection, which is a display that also holds a seat.
   */
  private takeCrewSeat(client: Client, playerName: string, role: ConnectionRole): void {
    if (this.state.players.size >= this.state.crewSize) {
      throw new ServerError(ErrorCode.APPLICATION_ERROR, "room_full");
    }
    const crewRole = this.findAvailableRole();
    if (crewRole === undefined) {
      throw new ServerError(ErrorCode.APPLICATION_ERROR, "room_full");
    }

    client.view = new StateView();
    const player = new PlayerState();
    player.playerId = client.sessionId;
    player.playerName = playerName;
    player.role = crewRole;
    player.ready = false;
    this.connectionRoles.set(client.sessionId, role);
    this.sequenceWatermarks.set(client.sessionId, new Map());
    this.state.players.set(client.sessionId, player);
    this.firstControllerJoined = true;
    this.lifecycle.clear("controllers_expired");
  }

  override async onLeave(client: Client, code: number): Promise<void> {
    const connectionRole = this.connectionRoles.get(client.sessionId);
    this.clearLatencyConnection(client.sessionId);
    if (connectionRole === "display" || connectionRole === "solo") {
      /*
       * A solo connection leaves as both, and `allowReconnection` may only be
       * awaited once per client. The display branch is the one to keep: it is
       * the stricter of the two, and for the only person in the room a
       * consented leave really should close it rather than start a grace
       * period for a crew that does not exist. The seat's own bookkeeping is
       * done around it.
       */
      const solo = connectionRole === "solo";
      const player = solo ? this.state.players.get(client.sessionId) : undefined;
      if (solo) {
        this.neutralizeRole(client.sessionId);
        if (player !== undefined) player.connected = false;
      }
      this.state.displayConnected = false;
      this.lifecycle.set(
        "display_reconnect_expired",
        Date.now() + reconnectionGraceSeconds * 1_000
      );
      this.updateStatus("display_grace");
      this.queueMetadataUpdate();
      if (code === CloseCode.CONSENTED) {
        // Both true for a solo connection, and this is the reason the
        // vocabulary already has: the client that drew the world is gone.
        this.disposeOnce("display_left");
        return;
      }
      try {
        const reconnected = await this.allowReconnection(client, reconnectionGraceSeconds);
        if (this.disposing) return;
        this.connectionRoles.set(reconnected.sessionId, connectionRole);
        this.displaySessionId = reconnected.sessionId;
        this.state.displayConnected = true;
        this.lifecycle.clear("display_reconnect_expired");
        if (solo) {
          if (player !== undefined) player.connected = true;
          // A fresh watermark map, exactly as the controller branch does: the
          // returning stream starts its sequences over.
          this.sequenceWatermarks.set(reconnected.sessionId, new Map());
          this.lifecycle.clear("controllers_expired");
        }
        this.registerLatencyConnection(reconnected);
        this.updateStatusFromRoom();
        this.queueMetadataUpdate();
        if (solo) this.tryStartRun();
      } catch {
        this.disposeOnce("display_reconnect_expired");
      }
      return;
    }

    if (connectionRole !== "controller") {
      return;
    }
    this.neutralizeRole(client.sessionId);
    const player = this.state.players.get(client.sessionId);
    if (player === undefined) {
      return;
    }
    player.connected = false;
    this.queueMetadataUpdate();
    if (code === CloseCode.CONSENTED) {
      this.removeController(client.sessionId);
      return;
    }

    try {
      const reconnected = await this.allowReconnection(client, reconnectionGraceSeconds);
      if (this.disposing) return;
      player.connected = true;
      this.connectionRoles.set(reconnected.sessionId, "controller");
      this.sequenceWatermarks.set(reconnected.sessionId, new Map());
      this.registerLatencyConnection(reconnected);
      this.lifecycle.clear("controllers_expired");
      this.queueMetadataUpdate();
      this.tryStartRun();
    } catch {
      this.removeController(client.sessionId);
    }
  }

  override onDispose(): void {
    this.disposing = true;
    this.cleanupResources();
  }

  handleReady(client: Client, unsafePayload: unknown): void {
    const command = this.parseControllerCommand(client, unsafePayload, readyCommandSchema);
    if (command === undefined) {
      return;
    }
    const acceptsReady =
      this.state.phase === "lobby" || this.gameState?.encounterPhase === "result";
    if (!acceptsReady) {
      this.sendError(client, "invalid_phase", "Ready requires the lobby or a run result.");
      return;
    }
    const player = this.state.players.get(client.sessionId);
    if (player === undefined) {
      this.sendError(client, "identity_mismatch", "Player identity does not match connection.");
      return;
    }
    player.ready = true;
    this.tryStartRun();
  }

  handlePilotInput(client: Client, unsafePayload: unknown): void {
    const command = this.parseRoleInput(
      client,
      unsafePayload,
      pilotInputCommandSchema,
      "pilot",
      clientMessage.pilotInput
    );
    if (command === undefined || this.gameState === undefined) {
      return;
    }
    this.gameState = applyPilotInput(this.gameState, {
      vector: command.vector,
      mgFiring: command.mgFiring,
      receivedTick: this.gameState.clock.tick,
      // Absent from a stick command, which names a bearing instead.
      turn: command.turn ?? null,
      thrust: command.thrust ?? null
    });
  }

  /**
   * Spends exactly one solo frame per step, oldest first.
   *
   * One, not all of them, and the difference is the whole of whether prediction
   * holds. The client advances one step per frame it sends; if the room spent
   * two frames inside a single step the client would have stepped twice where
   * the room stepped once, and the two ships would part company for good -
   * shots then leave from where the server thinks the hull is, which is not
   * where the pilot sees it.
   *
   * The lab has the same rule and reaches it from the other side: it steps the
   * tank once per input. We cannot step the world twice, so we take one input.
   *
   * Nor "only the newest": that would jump the acknowledgement past frames that
   * were never simulated, and the client would replay from a state the room
   * never produced. What is not spent this step waits in the buffer, and the
   * pilot's own instrument shows how deep it is getting.
   */
  private applySoloInputs(): void {
    if (this.gameState === undefined) return;
    for (const [sessionId, role] of this.connectionRoles) {
      if (role !== "solo") continue;
      const input = this.soloInputs.get(sessionId).next();
      if (input !== undefined) {
        const receivedTick = this.gameState.clock.tick;
        this.gameState = applyPilotInput(this.gameState, {
          vector: { x: input.vectorX, y: input.vectorY },
          mgFiring: input.mgFiring,
          receivedTick,
          // Absent rather than zero when the stick is driving: zero is a real
          // command at this helm and cannot stand for "no command".
          turn: input.hasHelm ? input.turn : null,
          thrust: input.hasHelm ? input.thrust : null
        });
        this.gameState = applyGunnerInput(this.gameState, {
          vector: { x: input.aimX, y: input.aimY },
          firing: input.firing,
          ...(input.hasAimTurn ? { turn: input.aimTurn } : {}),
          receivedTick
        });
        this.appliedSoloSeq = input.seq;
      }
    }
  }

  handleGunnerInput(client: Client, unsafePayload: unknown): void {
    const command = this.parseRoleInput(
      client,
      unsafePayload,
      gunnerInputCommandSchema,
      this.inputOwner("gunner"),
      clientMessage.gunnerInput
    );
    if (command === undefined || this.gameState === undefined) {
      return;
    }
    this.gameState = applyGunnerInput(this.gameState, {
      vector: command.aim,
      firing: command.firing,
      // Carried only when the panel sent one, so a bearing-naming client is
      // handed exactly the shape it has always been handed.
      ...(command.turn === undefined ? {} : { turn: command.turn }),
      receivedTick: this.gameState.clock.tick
    });
  }

  handleShieldInput(client: Client, unsafePayload: unknown): void {
    const command = this.parseRoleInput(
      client,
      unsafePayload,
      shieldInputCommandSchema,
      "shield",
      clientMessage.shieldInput
    );
    if (command === undefined || this.gameState === undefined) {
      return;
    }
    this.gameState = applyShieldInput(this.gameState, {
      vector: command.aim,
      active: command.active,
      receivedTick: this.gameState.clock.tick
    });
  }

  handleUpgradeVote(client: Client, unsafePayload: unknown): void {
    const command = this.parseControllerCommand(client, unsafePayload, upgradeVoteCommandSchema);
    if (command === undefined || this.gameState === undefined) {
      return;
    }

    const player = this.state.players.get(client.sessionId);
    if (player === undefined) {
      this.sendError(client, "identity_mismatch", "Player identity does not match connection.");
      return;
    }
    const fingerprint = upgradeFingerprint(command);
    const journal = this.upgradeJournals.get(client.sessionId) ?? [];
    const previous = journal.find(({ actionId }) => actionId === command.actionId);
    if (previous !== undefined) {
      if (previous.fingerprint !== fingerprint) {
        this.sendError(
          client,
          "action_conflict",
          "Action ID was already used for another command."
        );
      } else if (previous.outcome !== "accepted") {
        this.sendError(client, previous.outcome, upgradeErrorMessage(previous.outcome));
      }
      return;
    }

    if (this.gameState.encounterPhase !== "intermission") {
      this.storeUpgradeOutcome(client.sessionId, {
        actionId: command.actionId,
        fingerprint,
        outcome: "invalid_phase"
      });
      this.sendError(client, "invalid_phase", "Upgrade choice requires an intermission.");
      return;
    }

    const result = voteForTeamUpgrade(this.gameState, {
      role: player.role,
      waveNumber: command.waveNumber,
      offerId: command.offerId,
      upgradeId: command.upgradeId,
      revision: command.revision
    });
    this.storeUpgradeOutcome(client.sessionId, {
      actionId: command.actionId,
      fingerprint,
      outcome: result.status
    });
    if (result.status !== "accepted") {
      this.sendError(client, result.status, upgradeErrorMessage(result.status));
      return;
    }

    this.gameState = result.state;
    this.syncGameState();
  }

  handleLatencyPong(client: Client, unsafePayload: unknown, receivedAt = performance.now()): void {
    if (this.hasProtocolMismatch(unsafePayload)) {
      this.sendError(client, "protocol_mismatch", "Protocol version does not match server.");
      return;
    }
    const result = clientLatencyPongSchema.safeParse(unsafePayload);
    if (!result.success) {
      this.sendError(client, "invalid_message", "Message does not match the strict schema.");
      return;
    }
    if (!this.connectionClients.has(client.sessionId)) {
      this.sendError(client, "identity_mismatch", "Connection is not a member of this room.");
      return;
    }
    if (result.data.roomId !== this.roomId) {
      this.sendError(client, "identity_mismatch", "Room identity does not match connection.");
      return;
    }

    this.latency.acceptPong(client.sessionId, result.data.probeId, receivedAt);
  }

  advanceGameStep(): void {
    if (this.state.phase !== "active" || this.gameState === undefined) {
      return;
    }
    if (this.expireWaveDeadlineIfDue(Date.now())) {
      return;
    }
    this.applySoloInputs();
    const previousEncounterPhase = this.gameState.encounterPhase;
    const previousLootWindow = this.gameState.lootWindowTicksRemaining;
    const projectionWasResult = this.state.game.encounter.phase === "result";
    // The stand takes every helper off the arena, and this is one of them.
    if (sparringEnemies === 0) this.gameState = this.applyShieldAutopilot(this.gameState);
    const stepStartedAt = this.nowMs();
    this.gameState = advanceSpaceshipSimulation(this.gameState, this.gameConfig);
    this.lastStepMs = this.nowMs() - stepStartedAt;
    if (sparringEnemies > 0) {
      this.gameState = holdSparringStand(
        this.gameState,
        sparringEnemies,
        this.gameConfig.arenaRadius
      );
    }
    if (previousEncounterPhase === "combat" && this.gameState.encounterPhase !== "combat") {
      this.clearWaveDeadline();
      this.neutralizeAllRoles();
    } else if (previousEncounterPhase !== "combat" && this.gameState.encounterPhase === "combat") {
      this.armWaveDeadline();
    } else if (previousLootWindow === 0 && this.gameState.lootWindowTicksRemaining > 0) {
      this.extendWaveDeadlineForSalvage(this.gameState.lootWindowTicksRemaining);
    }
    this.syncGameState();
    if (
      previousEncounterPhase !== this.gameState.encounterPhase ||
      (this.gameState.encounterPhase === "result" && !projectionWasResult)
    ) {
      if (this.gameState.encounterPhase === "result") {
        this.enterTerminalResultLifecycle();
      }
      this.updateStatusFromRoom();
      this.queueMetadataUpdate();
    }
  }

  private parseRoleInput<T extends PilotInputCommand | GunnerInputCommand | ShieldInputCommand>(
    client: Client,
    unsafePayload: unknown,
    schema: RuntimeSchema<T>,
    role: CrewRole,
    messageType: InputMessageType
  ): T | undefined {
    const command = this.parseControllerCommand(client, unsafePayload, schema, role);
    if (command === undefined) {
      return undefined;
    }
    if (this.state.phase !== "active" || this.gameState?.encounterPhase !== "combat") {
      this.sendError(client, "invalid_phase", "Gameplay input requires combat.");
      return undefined;
    }
    const watermarks =
      this.sequenceWatermarks.get(client.sessionId) ?? new Map<InputMessageType, number>();
    const previous = watermarks.get(messageType) ?? 0;
    if (command.sequence <= previous) {
      return undefined;
    }
    watermarks.set(messageType, command.sequence);
    this.sequenceWatermarks.set(client.sessionId, watermarks);
    return command;
  }

  private parseControllerCommand<T>(
    client: Client,
    unsafePayload: unknown,
    schema: RuntimeSchema<T>,
    expectedRole?: CrewRole
  ): T | undefined {
    if (this.hasProtocolMismatch(unsafePayload)) {
      this.sendError(client, "protocol_mismatch", "Protocol version does not match server.");
      return undefined;
    }
    const result = schema.safeParse(unsafePayload);
    if (!result.success) {
      this.sendError(client, "invalid_message", "Message does not match the strict schema.");
      return undefined;
    }
    const connectionRole = this.connectionRoles.get(client.sessionId);
    if (connectionRole !== "controller" && connectionRole !== "solo") {
      this.sendError(client, "not_controller", "Only controllers may send gameplay messages.");
      return undefined;
    }
    const envelope = result.data as { roomId: string; playerId: string; runNumber: number };
    if (envelope.roomId !== this.roomId || envelope.playerId !== client.sessionId) {
      this.sendError(
        client,
        "identity_mismatch",
        "Room or player identity does not match connection."
      );
      return undefined;
    }
    const player = this.state.players.get(client.sessionId);
    if (this.connectionClients.get(client.sessionId) !== client || player === undefined) {
      this.sendError(client, "identity_mismatch", "Controller connection is not active.");
      return undefined;
    }
    if (expectedRole !== undefined && player.role !== expectedRole) {
      this.sendError(client, "role_mismatch", `Only ${expectedRole} may send this input.`);
      return undefined;
    }
    if (envelope.runNumber !== this.state.runNumber) {
      this.sendError(client, "stale_run", "Command belongs to another run.");
      return undefined;
    }
    return result.data;
  }

  private tryStartRun(): void {
    const canStart = this.state.phase === "lobby" || this.gameState?.encounterPhase === "result";
    if (!canStart || this.state.players.size !== this.state.crewSize || this.disposing) {
      return;
    }
    // One check covers both entrances: a lobby that has not started yet, and a
    // rematch after a result. Neither may begin a run the window is about to
    // interrupt.
    if (getMaintenanceWindow().isActive()) {
      return;
    }
    const players = [...this.state.players.values()];
    if (!players.every((player) => player.connected && player.ready)) {
      return;
    }
    const previousSeed = this.gameState?.runSeed;
    // A run keeps the balance it started with; console edits land on the next run.
    const balance = getBalanceStore();
    this.gameConfig = balance.getActiveSimulationConfig(this.state.shipArchetypeId);
    // The helm is input feel, not physics, so it rides beside the config rather
    // than inside it — and like the config, a run keeps what it started with.
    const tuning = balance.getActiveTuning();
    /*
     * The bot on an unmanned seat, set up beside the helm and for the same
     * reason: both are the run's, not the console's, so an edit mid-run does not
     * change the game being played. The level is the operator's own choice from
     * the preset - the section that used to drive only the demo harness.
     */
    this.crewProfile = resolveAutopilotProfile(
      tuning.autopilot,
      tuning.autopilot.level,
      this.gameConfig.cannonWeaponKind
    );
    // Seeded below, from the run's own seed, once that seed exists.
    this.crewOptions = {
      archetypes: this.gameConfig.enemyArchetypes,
      cannonSpeed: leadSpeedFor(
        this.gameConfig.cannonWeaponKind,
        this.gameConfig.projectileSpeedPerSecond
      ),
      mgSpeed: leadSpeedFor(
        this.gameConfig.mgWeaponKind,
        this.gameConfig.mgProjectileSpeedPerSecond
      ),
      turretRate: this.gameConfig.turretMaxAngularSpeedPerSecond,
      shieldRaiseRange: this.gameConfig.shieldAutopilotRaiseRange,
      shieldDrain: this.gameConfig.shieldDrainPerSecond
    };
    const helm = tuning.helm;
    this.state.game.helm.scheme = helm.scheme;
    this.state.game.helm.headingLeadRadians = helm.headingLeadRadians;
    this.state.game.helm.stopDampening = helm.stopDampening;
    this.state.game.helm.rotateInPlaceThrottle = helm.rotateInPlaceThrottle;
    this.state.game.helm.driveDeadzoneShare = helm.driveDeadzoneShare;
    this.state.game.helm.aimDeadzoneShare = helm.aimDeadzoneShare;
    this.state.game.helm.driveZoneShare = helm.driveZoneShare;
    this.state.game.helm.aimProjectionShare = helm.aimProjectionShare;
    this.state.game.helm.headingDeadbandRadians = helm.headingDeadbandRadians;
    this.state.game.helm.headingFilterSeconds = helm.headingFilterSeconds;
    this.state.game.helm.turretLeadRadians = helm.turretLeadRadians;
    this.state.game.helm.hullAngularBrakingPerSecondSquared =
      this.gameConfig.headingAngularBrakingPerSecondSquared;
    this.state.game.helm.hullAngularMaxSpeed = this.gameConfig.headingMaxAngularSpeedPerSecond;
    this.state.game.helm.hullAngularAcceleration =
      this.gameConfig.headingAngularAccelerationPerSecondSquared;
    this.state.game.helm.turretAngularMaxSpeed = this.gameConfig.turretMaxAngularSpeedPerSecond;
    this.state.game.helm.turretAngularAcceleration =
      this.gameConfig.turretAngularAccelerationPerSecondSquared;
    this.state.game.helm.turretAngularBraking =
      this.gameConfig.turretAngularBrakingPerSecondSquared;
    this.state.game.helm.turretMountedOnHull = this.gameConfig.turretMountedOnHull;
    const runSeed = createRunSeed(previousSeed);
    // The bot's own stream comes off the run's seed, so replaying a seed replays
    // the bot with it. A fresh memory per run also drops the target it had
    // committed to and the sector it was holding, both of which belong to a
    // fight that is over.
    this.crewMemory = createAutopilotMemory(runSeed);
    this.gameState = createCleanSpaceshipRun(this.gameConfig, runSeed, this.startWave);
    if (sparringEnemies > 0) {
      this.gameState = openSparringStand(
        this.gameState,
        sparringEnemies,
        this.gameConfig.arenaRadius
      );
    }
    this.state.runNumber += 1;
    this.state.phase = "active";
    this.state.hasGame = true;
    for (const player of players) player.ready = false;
    this.sequenceWatermarks.clear();
    for (const player of players) this.sequenceWatermarks.set(player.playerId, new Map());
    this.upgradeJournals.clear();
    this.lifecycle.clear("lobby_expired");
    this.lifecycle.clear("result_expired");
    this.initializeDecorations();
    this.publishEnemyCatalogue();
    this.armWaveDeadline();
    this.syncGameState();
    this.startSimulation();
    this.updateStatus("combat");
    this.queueMetadataUpdate();
  }

  /** The catalogue is fixed for the run, so the display receives it once at start. */
  private publishEnemyCatalogue(): void {
    const display = this.state.game.display;
    display.asteroidVisualShape = this.gameConfig.asteroidVisual?.shape ?? "";
    display.asteroidVisualScale = this.gameConfig.asteroidVisual?.modelScale ?? 1;
    display.spaceshipVisualShape = this.gameConfig.spaceshipVisual?.shape ?? "";
    display.shieldBandEffect = this.gameConfig.shieldBandEffect;
    display.shieldImpactEffect = this.gameConfig.shieldImpactEffect;
    display.spaceshipVisualScale = this.gameConfig.spaceshipVisual?.modelScale ?? 1;
    display.turretVisualShape = this.gameConfig.turretVisual?.shape ?? "";
    display.turretVisualScale = this.gameConfig.turretVisual?.modelScale ?? 1;
    display.turretMountX = this.gameConfig.turretVisual?.mountX ?? 0;
    display.turretMountY = this.gameConfig.turretVisual?.mountY ?? 0;
    display.turretPivotX = this.gameConfig.turretVisual?.pivotX ?? 0;
    display.turretPivotY = this.gameConfig.turretVisual?.pivotY ?? 0;
    display.shieldRadius = this.gameConfig.shieldRadius;
    const catalogue = display.enemyCatalogue;
    catalogue.clear();
    for (const [kind, archetype] of Object.entries(this.gameConfig.enemyArchetypes)) {
      const entry = new EnemyVisualState();
      entry.kind = kind;
      entry.label = archetype.label;
      entry.shape = archetype.visual.shape;
      entry.modelScale = archetype.visual.modelScale;
      entry.showHealthBar = archetype.visual.showHealthBar;
      entry.isBoss = archetype.spawnPolicy === "boss";
      entry.effectDeath = archetype.visual.effects?.death ?? "";
      entry.effectHit = archetype.visual.effects?.hit ?? "";
      entry.effectShot = archetype.visual.effects?.shot ?? "";
      catalogue.set(kind, entry);
    }
  }

  private initializeDecorations(): void {
    this.state.game.display.obstacles.clear();
    const scale = this.gameConfig.worldWidth / DECORATION_REFERENCE_WORLD;
    for (const obstacle of DECORATIVE_OBSTACLES) {
      const state = new ObstacleState();
      state.obstacleId = obstacle.obstacleId;
      state.kind = obstacle.kind;
      state.x = obstacle.x * scale;
      state.y = obstacle.y * scale;
      state.width = "width" in obstacle ? obstacle.width * scale : 0;
      state.height = "height" in obstacle ? obstacle.height * scale : 0;
      state.radius = "radius" in obstacle ? obstacle.radius * scale : 0;
      state.rotation = 0;
      this.state.game.display.obstacles.push(state);
    }
  }

  private syncGameState(): void {
    const game = this.gameState;
    if (game === undefined) {
      return;
    }
    projectGameState(this.state.game, game, this.gameConfig, this.waveDeadlineAtMs);
    // Not part of the projection: it measures the host, not the simulation
    // frame, and `projectGameState` is state plus config and nothing else.
    this.state.game.display.serverStepMs = this.lastStepMs;
    this.state.game.display.appliedInputSeq = this.appliedSoloSeq;
  }

  private neutralizeRole(playerId: string): void {
    if (this.gameState === undefined) {
      return;
    }
    const role = this.state.players.get(playerId)?.role;
    if (role === "pilot") {
      this.gameState = cancelPilotControl(this.gameState);
    } else if (role === "gunner") {
      this.gameState = cancelGunnerControl(this.gameState);
    } else if (role === "shield") {
      this.gameState = cancelShieldControl(this.gameState);
    }
    this.syncGameState();
  }

  private neutralizeAllRoles(): void {
    if (this.gameState === undefined) return;
    this.gameState = cancelPilotControl(this.gameState);
    this.gameState = cancelGunnerControl(this.gameState);
    this.gameState = cancelShieldControl(this.gameState);
  }

  private storeUpgradeOutcome(playerId: string, entry: UpgradeJournalEntry): void {
    const journal = this.upgradeJournals.get(playerId) ?? [];
    journal.push(entry);
    if (journal.length > MAX_UPGRADE_JOURNAL_ENTRIES) {
      journal.splice(0, journal.length - MAX_UPGRADE_JOURNAL_ENTRIES);
    }
    this.upgradeJournals.set(playerId, journal);
  }

  private joinDisplay(client: Client, role: ConnectionRole = "display"): void {
    if (this.displaySessionId !== undefined) {
      throw new ServerError(ErrorCode.APPLICATION_ERROR, "display_already_connected");
    }
    // A solo connection already has a view holding its seat; adding the world
    // branch to it is the whole difference between the two roles.
    client.view ??= new StateView();
    client.view.add(this.state.game, DISPLAY_VIEW_TAG);
    this.displaySessionId = client.sessionId;
    this.connectionRoles.set(client.sessionId, role);
    this.state.displayConnected = true;
  }

  private registerLatencyConnection(client: Client): void {
    this.clearLatencyConnection(client.sessionId);
    this.connectionClients.set(client.sessionId, client);
    this.latency.register(client.sessionId);
  }

  private clearLatencyConnection(sessionId: string): void {
    this.latency.clear(sessionId);
    this.connectionClients.delete(sessionId);
  }

  private clearAllLatencyConnections(): void {
    this.latency.clearAll();
    this.connectionClients.clear();
    this.state.displayLatencyMs = -1;
    for (const player of this.state.players.values()) player.latencyMs = -1;
  }

  private publishLatency(sessionId: string, latencyMs: number): void {
    if (sessionId === this.displaySessionId) {
      this.state.displayLatencyMs = latencyMs;
      return;
    }
    const player = this.state.players.get(sessionId);
    if (player !== undefined) player.latencyMs = latencyMs;
  }

  private findAvailableRole(): CrewRole | undefined {
    const occupied = new Set([...this.state.players.values()].map((player) => player.role));
    return this.crewRoles().find((role) => !occupied.has(role));
  }

  /** The roles this room has seats for; a smaller crew keeps the CREW_ROLES order. */
  private crewRoles(): readonly CrewRole[] {
    return CREW_ROLES.slice(0, this.state.crewSize);
  }

  /**
   * Who owns an input in this room. A solo player flies and mans the turret, so
   * the gunner stream belongs to the pilot; every other crew keeps one role per
   * input. An input nobody owns keeps its own role and therefore never matches
   * a seated player.
   */
  private inputOwner(role: CrewRole): CrewRole {
    return role === "gunner" && this.state.crewSize === 1 ? "pilot" : role;
  }

  private removeController(playerId: string): void {
    this.clearLatencyConnection(playerId);
    this.state.players.delete(playerId);
    this.connectionRoles.delete(playerId);
    this.sequenceWatermarks.delete(playerId);
    this.upgradeJournals.delete(playerId);
    if (this.firstControllerJoined && this.state.players.size === 0 && !this.disposing) {
      this.lifecycle.set("controllers_expired", Date.now() + zeroControllerTtlSeconds * 1_000);
    }
    this.queueMetadataUpdate();
  }

  /**
   * A crew without a shield operator still needs the sector up, so the room
   * feeds the same trusted intent a player would have sent - decided by the
   * same policy that plays whole measured runs.
   *
   * The policy is handed the client slice rather than the state: it is a model
   * of a player, and a bot that reads the whole simulation dodges what no player
   * could see, which would make every measurement of survivability this project
   * has incomparable with the ones before it.
   */
  private applyShieldAutopilot(game: SpaceshipSimulationState): SpaceshipSimulationState {
    if (this.crewRoles().includes("shield") || this.gameState?.encounterPhase !== "combat") {
      return game;
    }
    // No profile means the preset carries none for this turret and level, and a
    // room does not invent one: the sector then behaves as it did with nobody
    // in the seat before any of this existed, which is to say it stays down.
    const profile = this.crewProfile;
    if (profile === undefined) return game;
    const world = buildCrewWorld(game, this.gameConfig, game.clock.tick * POLICY_TICK_MS);
    const plan = planShield(world, profile, this.crewMemory, this.crewOptions);
    return applyShieldInput(game, {
      vector: plan.aim,
      active: plan.active,
      receivedTick: game.clock.tick
    });
  }

  /**
   * Arms the loop for the room's whole life, once.
   *
   * The library's own fixed step, not ours. Its accumulator is the one we used
   * to run by hand - spend whole steps out of elapsed real time, with a ceiling
   * so a stall does not become an avalanche - and it does one thing ours could
   * not: it advertises the rate to the clients, and a predicting client paces
   * its input by that number. Which is why this is armed at creation and not
   * when the fight starts: the rate rides the join handshake, so a rate
   * declared after the crew connected reaches nobody, and the cockpit comes up
   * with prediction refusing to start.
   *
   * The gate is a flag rather than a cleared timer for the same reason.
   */
  private armSimulationLoop(): void {
    /*
     * The broadcast has to be a whole number of steps, and here is where both
     * numbers exist. A patch that carries alternately one and two steps of
     * movement is uneven sampling, and no amount of smoothing on the far end
     * puts back what the wire took out.
     */
    const stepMs = this.gameConfig.fixedStepMs;
    if (Math.abs(PATCH_INTERVAL_MS / stepMs - Math.round(PATCH_INTERVAL_MS / stepMs)) > 1e-9) {
      throw new RangeError(
        `PATCH_INTERVAL_MS (${String(PATCH_INTERVAL_MS)} ms) must be a whole multiple of the ` +
          `simulation step (${String(stepMs)} ms), or snapshots are unevenly spaced.`
      );
    }
    this.patchRate = PATCH_INTERVAL_MS;
    this.setFixedTimestep(
      () => {
        if (!this.simulationRunning) return;
        this.advanceGameStep();
      },
      Math.round(1000 / this.gameConfig.fixedStepMs)
    );
  }

  private startSimulation(): void {
    this.simulationRunning = true;
  }

  private stopSimulation(): void {
    this.simulationRunning = false;
    // A stopped simulation costs nothing, and the last number from the fight
    // would otherwise read as a tick that is still running.
    this.lastStepMs = 0;
    this.state.game.display.serverStepMs = 0;
  }

  /**
   * Monotonic clock the step measurement reads. A seam rather than a bare call
   * to `performance.now()` so a test can hold time still and prove the published
   * number is the price of one step and not the sum of the steps a wake ran.
   */
  protected nowMs(): number {
    return performance.now();
  }

  private armWaveDeadline(now = Date.now()): void {
    this.clearWaveDeadline();
    if (this.state.phase !== "active" || this.gameState?.encounterPhase !== "combat") return;
    this.waveDeadlineAtMs = now + waveTtlSeconds * 1_000;
    this.scheduleWaveDeadline(this.waveDeadlineGeneration);
  }

  /**
   * A won wave stays in combat while the crew collects salvage, so the deadline
   * has to move with it: without this a wave cleared at the wire would be lost
   * to a timeout after it was already won.
   */
  private extendWaveDeadlineForSalvage(ticksRemaining: number): void {
    const until =
      Date.now() + ticksRemaining * this.gameConfig.fixedStepMs + SALVAGE_DEADLINE_SLACK_MS;
    if (this.waveDeadlineAtMs !== undefined && this.waveDeadlineAtMs >= until) return;
    this.clearWaveDeadline();
    this.waveDeadlineAtMs = until;
    this.scheduleWaveDeadline(this.waveDeadlineGeneration);
  }

  private scheduleWaveDeadline(generation: number): void {
    const deadline = this.waveDeadlineAtMs;
    if (deadline === undefined || generation !== this.waveDeadlineGeneration || this.disposing) {
      return;
    }
    this.waveDeadlineTimer = this.clock.setTimeout(
      () => {
        if (generation !== this.waveDeadlineGeneration || this.disposing) return;
        this.waveDeadlineTimer = undefined;
        if (!this.expireWaveDeadlineIfDue(Date.now())) {
          this.scheduleWaveDeadline(generation);
        }
      },
      Math.max(1, deadline - Date.now())
    );
  }

  private expireWaveDeadlineIfDue(now: number): boolean {
    const deadline = this.waveDeadlineAtMs;
    if (deadline === undefined || now < deadline) return false;
    if (this.state.phase !== "active" || this.gameState?.encounterPhase !== "combat") {
      this.clearWaveDeadline();
      return false;
    }
    this.gameState = failWaveByTimeout(this.gameState);
    this.clearWaveDeadline();
    this.neutralizeAllRoles();
    this.syncGameState();
    this.enterTerminalResultLifecycle();
    this.updateStatusFromRoom();
    this.queueMetadataUpdate();
    return true;
  }

  private clearWaveDeadline(): void {
    this.waveDeadlineGeneration += 1;
    this.waveDeadlineTimer?.clear();
    this.waveDeadlineTimer = undefined;
    this.waveDeadlineAtMs = undefined;
  }

  private enterTerminalResultLifecycle(): void {
    this.stopSimulation();
    for (const player of this.state.players.values()) player.ready = false;
    // The crew got to finish; there is nothing left for this room to wait for,
    // because the rematch it would wait for is refused anyway.
    if (getMaintenanceWindow().isActive()) {
      this.disposeOnce("maintenance_window");
      return;
    }
    this.lifecycle.set("result_expired", Date.now() + resultTtlSeconds * 1_000);
  }

  private disposeOnce(reason: RoomClosingReason): void {
    if (this.disposing) return;
    this.disposing = true;
    this.updateStatus("closing");
    this.queueMetadataUpdate();
    this.broadcast(serverMessage.roomClosing, { reason });
    this.cleanupResources();
    // `onLeave()` is part of Colyseus' disconnect lifecycle. Awaiting the
    // room-wide disconnect from inside that callback deadlocks on the client
    // that initiated the consented leave, so initiate it and let onLeave return.
    void this.disconnect();
  }

  private cleanupResources(): void {
    this.lifecycle.stop();
    this.maintenanceTimer?.clear();
    this.maintenanceTimer = undefined;
    this.clearWaveDeadline();
    this.stopSimulation();
    this.clearAllLatencyConnections();
    this.sequenceWatermarks.clear();
    this.upgradeJournals.clear();
    this.connectionClients.clear();
    this.connectionRoles.clear();
    this.displaySessionId = undefined;
  }

  private updateStatusFromRoom(): void {
    if (this.disposing) {
      this.updateStatus("closing");
    } else if (this.lifecycle.has("display_reconnect_expired")) {
      this.updateStatus("display_grace");
    } else if (this.state.phase === "lobby") {
      this.updateStatus("lobby");
    } else {
      this.updateStatus(this.gameState?.encounterPhase ?? "combat");
    }
  }

  private updateStatus(status: RoomStatsStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.statusChangedAtMs = Date.now();
  }

  private queueMetadataUpdate(): void {
    if (this.statsId.length === 0) return;
    this.pendingMetadata = this.createStatsMetadata();
    if (this.metadataWritePromise !== undefined) return;
    const write = this.flushMetadataWrites();
    this.metadataWritePromise = write;
    void write.then(() => {
      if (this.metadataWritePromise !== write) return;
      this.metadataWritePromise = undefined;
      if (this.pendingMetadata !== undefined) this.queueMetadataUpdate();
    });
  }

  private async flushMetadataWrites(): Promise<void> {
    while (this.pendingMetadata !== undefined) {
      const metadata = this.pendingMetadata;
      this.pendingMetadata = undefined;
      try {
        await this.setMetadata(metadata);
      } catch {
        // Statistics are operational diagnostics and must never affect gameplay.
      }
    }
  }

  private createStatsMetadata(): RoomStatsMetadata {
    let connectedPlayers = 0;
    let reservedPlayers = 0;
    for (const player of this.state.players.values()) {
      if (player.connected) connectedPlayers += 1;
      else reservedPlayers += 1;
    }
    return {
      statsId: this.statsId,
      status: this.status,
      connectedPlayers,
      reservedPlayers,
      capacity: PLAYER_CAPACITY,
      displayConnected: this.state.displayConnected,
      createdAtMs: this.createdAtMs,
      statusChangedAtMs: this.statusChangedAtMs,
      expiresAtMs: this.lifecycle.next()?.expiresAtMs ?? null
    };
  }

  private hasProtocolMismatch(payload: unknown): boolean {
    return (
      typeof payload === "object" &&
      payload !== null &&
      "protocolVersion" in payload &&
      (payload as { protocolVersion?: unknown }).protocolVersion !== PROTOCOL_VERSION
    );
  }

  private sendError(client: Client, code: ServerErrorCode, message: string): void {
    client.send(serverMessage.error, { code, message });
  }
}
