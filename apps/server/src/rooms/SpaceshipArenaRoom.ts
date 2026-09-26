import { randomUUID } from "node:crypto";

import { Room, type Client } from "colyseus";
import { StateView, type MapSchema } from "@colyseus/schema";
import {
  ARENA_SHIP_COUNT,
  IDLE_ARENA_INTENT,
  ARENA_SCAN_COOLDOWN_TICKS,
  ARENA_SCAN_RADIUS_CELLS,
  ARENA_SCAN_REVEAL_TICKS,
  createArenaMatch,
  defaultArenaMatchConfig,
  type ArenaMatchConfig,
  type ArenaMatchState,
  type ArenaShipState
} from "@spaceship-defender/game-core";
import {
  ARENA_BOT_FILL_MS,
  ARENA_LOBBY_WAIT_SECONDS,
  ARENA_RESULT_HOLD_MS,
  ASSET_WAIT_SECONDS,
  CAMERA_VIEW_WIDTH_MAX,
  PATCH_INTERVAL_MS,
  PROTOCOL_VERSION,
  SOLO_INPUT_BUFFER_SIZE,
  SOLO_INPUT_RANGES,
  SoloInput,
  arenaScanCommandSchema,
  clientAssetsReadySchema,
  clientLatencyPongSchema,
  clientMessage,
  gunnerInputCommandSchema,
  pilotInputCommandSchema,
  serverMessage,
  shieldInputCommandSchema,
  type ArenaLobby
} from "@spaceship-defender/protocol";

import { getBalanceStore } from "../balance/index.js";
import { getServerRecords } from "../stats/index.js";
import type { RoomStatsMetadata, RoomStatsStatus } from "../stats/types.js";
import { LatencyTracker } from "./latencyTracker.js";
import {
  ARENA_PLAYER_SLOT,
  arenaIntentFromCockpit,
  createArenaBots,
  createArenaSeats,
  createRunSeed,
  stepArenaMatch,
  sweepArena,
  toArenaMatchConfig,
  toArenaScanTuning,
  type ArenaBots,
  type ArenaScanTuning
} from "@spaceship-defender/game-runtime";
import type { ArenaShipIntent } from "@spaceship-defender/game-core";

import {
  ArenaLootView,
  ArenaShipView,
  ArenaZoneView,
  DISPLAY_VIEW_TAG,
  PlayerState,
  ProjectileState,
  SpaceshipDefenderState
} from "./SpaceshipDefenderState.js";
import { leadSpeedFor } from "@spaceship-defender/game-runtime/crewPolicy.mjs";

/**
 * How long a wreck stays published after it stops flying.
 *
 * Long enough for the display to notice, play the explosion and let the health
 * bar be seen reaching zero; short enough that a match's collection is the
 * living field plus whatever just stopped being part of it.
 */
const WRECK_HOLD_TICKS = 120;
/**
 * How long a started match is kept after the last person leaves.
 *
 * Long enough to be a dropped connection rather than a decision: a phone that
 * loses the network for a few seconds comes back to its own fight, into the
 * seat the autopilot was holding. Past that it is an empty room stepping
 * sixteen hulls sixty times a second for nobody - measured at about four and a
 * half megabytes and a share of a core each, and four of them were found
 * sitting on a stand.
 */
const EMPTY_MATCH_HOLD_MS = 30_000;

/**
 * A match of sixteen hulls, published through the campaign's own state.
 *
 * The arena has its own simulation but not, yet, its own contract: this room
 * mirrors a match into the shape the display already draws - the player's hull
 * as the ship, the other fifteen as enemy entities, their shots as hostile
 * ones - so the mode can be watched and judged before a line of rendering is
 * written for it. What that borrows is a picture; what it costs is the things
 * an enemy entity has no room for, a rival's shield and turret among them.
 * Both go away with the arena's own protocol.
 */
export class SpaceshipArenaRoom extends Room<{ state: SpaceshipDefenderState }> {
  override maxClients = ARENA_SHIP_COUNT;
  /**
   * The room outlives its clients, on purpose.
   *
   * A match belongs to sixteen hulls, not to whoever happens to be watching:
   * the library's default closes a room the moment its last client goes, so a
   * player being shot down and leaving ended the fight for the fifteen still
   * in it. The room now lets go when the match is decided instead - see
   * `holdForResult` - and an empty waiting room is disposed the moment the
   * last person walks out of it, because that one is nothing but its clients.
   */
  override autoDispose = false;
  /**
   * The cockpit's own input stream, exactly as the campaign defines it.
   *
   * This is the path a seated player actually uses: `pilot:input` and the other
   * two messages are what a phone on a shared screen sends, and a cockpit stops
   * sending them the moment it has a ship of its own to replay - it rides this
   * acknowledged stream instead. The arena had the messages and not the stream,
   * which is precisely why the hull kept flying itself with a player at the
   * sticks: the frames arrived at a room that had never asked for them.
   */
  private readonly soloInputs = this.defineInput(SoloInput, {
    bufferMaxSize: SOLO_INPUT_BUFFER_SIZE,
    seqField: "seq",
    sanitize: SOLO_INPUT_RANGES
  });
  private config: ArenaMatchConfig = defaultArenaMatchConfig;
  private match: ArenaMatchState | undefined;
  private bots: ArenaBots | undefined;
  /**
   * Whether the seated player's screen has loaded what the match draws and
   * plays. Undefined with no player, or with one whose screen loads nothing.
   */
  private playerAssetsReady: boolean | undefined;
  /** Seconds of the waiting room the player's loading may still hold still. */
  private assetWaitSecondsRemaining = 0;
  /**
   * Round trips of every connection, probed the way the campaign probes them.
   *
   * The state has one display latency, so it carries the cockpit's while a
   * player is seated and a watcher's only when nobody is.
   */
  private readonly connectionClients = new Map<string, Client>();
  private readonly latency = new LatencyTracker({
    sendProbe: (sessionId, probeId) => {
      this.connectionClients
        .get(sessionId)
        ?.send(serverMessage.latencyProbe, { protocolVersion: PROTOCOL_VERSION, probeId });
    },
    schedule: (callback, delayMs) => this.clock.setTimeout(callback, delayMs),
    publish: (sessionId, latencyMs) => {
      if (this.playerSessionId !== undefined && sessionId !== this.playerSessionId) return;
      this.state.displayLatencyMs = latencyMs;
    },
    now: () => performance.now()
  });
  /** Seconds left in the waiting room; the match starts when it reaches zero. */
  private waitSecondsRemaining = ARENA_LOBBY_WAIT_SECONDS;
  private started = false;
  /** Seats taken by bots so far, while the fill animation runs. */
  private botsSeated = 0;
  /**
   * What the room dashboard is told about this match.
   *
   * A match published nothing at all until now, so a person flying one did not
   * appear on the dashboard in any column: the page counted campaign rooms and
   * called the number "players online".
   */
  private statsId = "";
  /** When the last client left a started match; see `EMPTY_MATCH_HOLD_MS`. */
  private emptySince: number | undefined;
  private readonly createdAtMs = Date.now();
  private statsStatus: RoomStatsStatus = "lobby";
  private statusChangedAtMs = Date.now();
  /** The last sheet published, as a string; see `publishZones`. */
  private zoneSignature = "";
  /**
   * What the seated player is asking for right now.
   *
   * Held rather than queued: the arena does not predict on the client yet, so
   * a frame is a statement of intent that stands until the next one, the same
   * way a held stick does. Undefined while nobody is flying, which is when the
   * autopilot takes the seat.
   */
  private playerIntent: ArenaShipIntent | undefined;
  /** Whoever claimed the player slot, which is what stops the bot flying it. */
  private playerSessionId: string | undefined;
  /** The last cockpit frame actually spent, published so the replay can start. */
  private appliedSoloSeq = 0;
  /** Set once the match is decided and the room is counting itself down. */
  private closing = false;
  /**
   * The bearing the hull was last told to hold.
   *
   * A released stick sends a zero vector, which names no bearing at all; the
   * campaign's helm keeps the previous one in that case, and the client's own
   * prediction assumes it does. Forgetting it here would brake the hull the
   * instant a thumb lifts while the predictor kept turning - the two would
   * disagree every time a player let go.
   */
  private playerHeadingTarget: number | null = null;
  /** The same, for the gun: a released aim stick keeps the bearing it had. */
  private playerTurretTarget: number | null = null;
  /**
   * The sweep.
   *
   * A match is fought on a field several screens wide, so a pilot with no way
   * to look past their own camera is guessing. The sweep is Steel Hunter's
   * answer: press for a look, wait out a cooldown, and what it found stays on
   * the dial a while after it has moved.
   *
   * Held by the room rather than by the simulation because exactly one seat is
   * human in this prototype. The moment a match seats sixteen people this has
   * to move into `ArenaShipState` and be published per client - what is
   * revealed is one pilot's knowledge, not the field's.
   */
  private scan: ArenaScanTuning = {
    radiusCells: ARENA_SCAN_RADIUS_CELLS,
    cooldownTicks: ARENA_SCAN_COOLDOWN_TICKS,
    revealTicks: ARENA_SCAN_REVEAL_TICKS
  };
  private scanReadyTick = 0;
  private scanRevealedUntilTick = 0;
  private revealed = new Set<string>();

  override onCreate(): void {
    this.state = new SpaceshipDefenderState();
    this.state.roomId = this.roomId;
    // A match opens as a waiting room, not as a fight: people get a window to
    // arrive, and whatever seats are still empty when it closes go to bots.
    this.state.phase = "lobby";
    this.state.crewSize = 1;
    // A waiting room has no run: the contract wants run zero and no game while
    // the phase is lobby, and both appear the moment the match starts.
    this.state.hasGame = false;
    this.state.runNumber = 0;

    const balance = getBalanceStore();
    const tuning = balance.getActiveTuning();
    const hull = balance.getActiveSimulationConfig(tuning.defaultShipArchetypeId);
    this.config = toArenaMatchConfig(tuning, hull);
    const ship = this.config.ship;
    this.state.shipArchetypeId = tuning.defaultShipArchetypeId;
    // The sweep is the operator's too, and it is read once for the match like
    // everything else: a console edit lands on the next one.
    this.scan = toArenaScanTuning(tuning);

    const seats = createArenaSeats(this.config, tuning.autopilot.level);
    this.match = createArenaMatch(this.config, createRunSeed(undefined), seats);
    this.bots = createArenaBots(tuning, this.config);

    this.state.game.worldWidth = ship.worldWidth;
    this.state.game.worldHeight = ship.worldHeight;
    this.state.game.encounter.phase = "combat";
    this.state.game.encounter.waveNumber = 1;
    /*
     * The same frame the campaign is played in, from the same setting.
     *
     * It used to frame the whole disc, which made a hull a third of the size it
     * is in the campaign and every distance a different distance: a player who
     * has learned one mode was handed another camera in the other. The field is
     * the radar's job - the whole point of putting it over the stick - and the
     * frame's job is to make a ship the size a ship is.
     */
    const display = this.state.game.display;
    display.cameraViewWidth = Math.min(CAMERA_VIEW_WIDTH_MAX, tuning.arena.cameraViewWidth);
    /*
     * The hull as the console draws it, whole.
     *
     * Only the silhouette travelled before, so every ship in a match - the
     * player's included - flew with the fallback turret rather than the one
     * chosen in the catalogue, and the mount and pivot the operator set were
     * nowhere. Sixteen copies of our own ship have to look like our own ship.
     */
    display.spaceshipVisualShape = ship.spaceshipVisual?.shape ?? "";
    display.spaceshipVisualScale = ship.spaceshipVisual?.modelScale ?? 1;
    display.turretVisualShape = ship.turretVisual?.shape ?? "";
    display.turretVisualScale = ship.turretVisual?.modelScale ?? 1;
    display.turretMountX = ship.turretVisual?.mountX ?? 0;
    display.turretMountY = ship.turretVisual?.mountY ?? 0;
    display.turretPivotX = ship.turretVisual?.pivotX ?? 0;
    display.turretPivotY = ship.turretVisual?.pivotY ?? 0;
    display.machineGunVisualShape = ship.machineGunVisual?.shape ?? "";
    display.machineGunVisualScale = ship.machineGunVisual?.modelScale ?? 1;
    display.machineGunMountX = ship.machineGunVisual?.mountX ?? 0;
    display.machineGunMountY = ship.machineGunVisual?.mountY ?? 0;
    display.machineGunPivotX = ship.machineGunVisual?.pivotX ?? 0;
    display.machineGunPivotY = ship.machineGunVisual?.pivotY ?? 0;
    display.asteroidVisualShape = ship.asteroidVisual?.shape ?? "";
    display.asteroidVisualScale = ship.asteroidVisual?.modelScale ?? 1;
    /*
     * The sky, which the arena was flying without.
     *
     * The campaign projects it with the rest of its display block and a match
     * never did, so the field came out as an empty black square. The picture and
     * its parallax, fixed for the match like the silhouettes are.
     */
    display.backgroundImage = ship.background.image;
    display.backgroundParallaxStrength = ship.background.parallaxStrength;
    display.shieldBandEffect = ship.shieldBandEffect;
    display.shieldImpactEffect = ship.shieldImpactEffect;
    display.shipDeathEffect = ship.shipDeathEffect;
    display.shipMuzzleEffect = ship.shipMuzzleEffect;
    /*
     * Every hull in a match is this hull, so one set of sounds covers the
     * field: what the player is heard firing is what fifteen rivals are heard
     * firing, which is also what a kill of any of them sounds like.
     */
    display.shipCannonSound = ship.shipCannonSound;
    display.shipMgSound = ship.shipMgSound;
    display.shipHitSound = ship.shipHitSound;
    display.shipDeathSound = ship.shipDeathSound;
    display.shieldRadius = ship.shieldRadius;
    // The drive block is what a predicting client replays from; the arena does
    // not predict yet, but the contract asks for real numbers and they exist.
    const drive = this.state.game.display.drive;
    drive.speedPerSecond = ship.spaceshipSpeedPerSecond;
    drive.accelerationPerSecondSquared = ship.spaceshipAccelerationPerSecondSquared;
    drive.brakingPerSecondSquared = ship.spaceshipBrakingPerSecondSquared;
    drive.reverseSpeedFactor = ship.spaceshipReverseSpeedFactor;
    drive.headingMaxAngularSpeed = ship.headingMaxAngularSpeedPerSecond;
    drive.headingAngularAcceleration = ship.headingAngularAccelerationPerSecondSquared;
    drive.headingAngularBraking = ship.headingAngularBrakingPerSecondSquared;
    drive.turretMaxAngularSpeed = ship.turretMaxAngularSpeedPerSecond;
    drive.turretAngularAcceleration = ship.turretAngularAccelerationPerSecondSquared;
    drive.turretAngularBraking = ship.turretAngularBrakingPerSecondSquared;
    drive.hullRadius = ship.spaceshipRadius;

    /*
     * The helm block, which only a cockpit reads.
     *
     * Without it the sticks fall back on the schema's defaults, and the two
     * that matter most are zero there: the dead zones. A thumb is never still,
     * and two pixels of slip on the ring is a couple of degrees of commanded
     * heading - the tremble the preset's dead zone exists to absorb. The mount
     * flag belongs here for the same reason: it decides what a stick bearing
     * means, and the client replays with it.
     */
    const helm = this.state.game.helm;
    helm.scheme = tuning.helm.scheme;
    helm.headingLeadRadians = tuning.helm.headingLeadRadians;
    helm.stopDampening = tuning.helm.stopDampening;
    helm.rotateInPlaceThrottle = tuning.helm.rotateInPlaceThrottle;
    helm.driveDeadzoneShare = tuning.helm.driveDeadzoneShare;
    helm.aimDeadzoneShare = tuning.helm.aimDeadzoneShare;
    helm.driveZoneShare = tuning.helm.driveZoneShare;
    helm.aimProjectionShare = tuning.helm.aimProjectionShare;
    helm.headingDeadbandRadians = tuning.helm.headingDeadbandRadians;
    helm.headingFilterSeconds = tuning.helm.headingFilterSeconds;
    helm.turretLeadRadians = tuning.helm.turretLeadRadians;
    helm.hullAngularBrakingPerSecondSquared = ship.headingAngularBrakingPerSecondSquared;
    helm.hullAngularMaxSpeed = ship.headingMaxAngularSpeedPerSecond;
    helm.hullAngularAcceleration = ship.headingAngularAccelerationPerSecondSquared;
    helm.turretAngularMaxSpeed = ship.turretMaxAngularSpeedPerSecond;
    helm.turretAngularAcceleration = ship.turretAngularAccelerationPerSecondSquared;
    helm.turretAngularBraking = ship.turretAngularBrakingPerSecondSquared;
    helm.turretMountedOnHull = ship.turretMountedOnHull;
    this.state.game.cannon.kind = ship.cannonWeaponKind;
    this.state.game.cannon.reach = leadSpeedFor(
      ship.cannonWeaponKind,
      ship.projectileSpeedPerSecond
    );
    this.patchRate = PATCH_INTERVAL_MS;
    this.setFixedTimestep(
      () => {
        this.step();
      },
      Math.round(1000 / ship.fixedStepMs)
    );

    this.statsId = randomUUID();
    // One tick a second for the waiting room, which is what its display shows.
    this.clock.setInterval(() => {
      this.countDown();
    }, 1_000);
    /*
     * And one for the dashboard, at the same rate.
     *
     * A match changes what it is worth reporting - who is connected, whether it
     * has started - on events that are already busy, so this is a heartbeat
     * rather than a call at every one of them: the page polls every few seconds
     * and a second of lag in a count of people is not a number anybody reads.
     */
    this.clock.setInterval(() => {
      void this.publishStats();
    }, 1_000);
    this.broadcastLobby();
    void this.publishStats();
  }

  /**
   * The player's own hull, driven from the cockpit.
   *
   * The arena reuses the campaign's three input messages rather than inventing
   * its own: they already carry a bearing, a throttle and a trigger, already
   * have schemas, and a solo cockpit already sends them. What changes is only
   * where they land - one slot of sixteen instead of the room's single ship.
   */
  private readonly inputHandlers = {
    [clientMessage.pilotInput]: (_client: Client, payload: unknown) => {
      const parsed = pilotInputCommandSchema.safeParse(payload);
      if (!parsed.success) return;
      const command = parsed.data;
      this.playerIntent = {
        ...(this.playerIntent ?? IDLE_ARENA_INTENT),
        driveVector: command.vector,
        turn: command.turn ?? null,
        thrust: command.thrust ?? null,
        headingTargetAngle: bearingOf(command.vector),
        mgFiring: command.mgFiring
      };
    },
    [clientMessage.gunnerInput]: (_client: Client, payload: unknown) => {
      const parsed = gunnerInputCommandSchema.safeParse(payload);
      if (!parsed.success) return;
      this.playerIntent = {
        ...(this.playerIntent ?? IDLE_ARENA_INTENT),
        turretTargetAngle: bearingOf(parsed.data.aim),
        firing: parsed.data.firing
      };
    },
    [clientMessage.arenaScan]: (client: Client, payload: unknown) => {
      if (client.sessionId !== this.playerSessionId) return;
      if (!arenaScanCommandSchema.safeParse(payload).success) return;
      this.sweep();
    },
    [clientMessage.shieldInput]: (_client: Client, payload: unknown) => {
      const parsed = shieldInputCommandSchema.safeParse(payload);
      if (!parsed.success) return;
      this.playerIntent = {
        ...(this.playerIntent ?? IDLE_ARENA_INTENT),
        shieldTargetAngle: bearingOf(parsed.data.aim),
        shieldActive: parsed.data.active
      };
    },
    [clientMessage.latencyPong]: (client: Client, payload: unknown) => {
      const parsed = clientLatencyPongSchema.safeParse(payload);
      if (!parsed.success || parsed.data.roomId !== this.roomId) return;
      this.latency.acceptPong(client.sessionId, parsed.data.probeId, performance.now());
    },
    /** The player's screen has loaded what the match draws and plays. */
    [clientMessage.assetsReady]: (client: Client, payload: unknown) => {
      const parsed = clientAssetsReadySchema.safeParse(payload);
      if (!parsed.success || parsed.data.roomId !== this.roomId) return;
      if (client.sessionId !== this.playerSessionId || this.playerAssetsReady !== false) return;
      this.playerAssetsReady = true;
      this.broadcastLobby();
    }
  };

  override onJoin(client: Client, unsafeOptions?: unknown): void {
    // Somebody is here again, so the empty-room countdown is off.
    this.emptySince = undefined;
    // Everyone watching gets the world branch: the arena has no controller
    // panels of its own yet, so there is nothing to gate off anybody.
    const view = (client.view ??= new StateView());
    view.add(this.state.game, DISPLAY_VIEW_TAG);
    this.state.displayConnected = true;
    /*
     * A cockpit claims the player slot; a plain display only watches.
     *
     * The seat is also published as a player, because that is what the cockpit
     * on the client looks for before it starts sending: one roster entry, in
     * the pilot role, already ready - a match has no readiness to wait for.
     */
    const options = unsafeOptions as
      { role?: unknown; playerName?: unknown; loadsAssets?: unknown } | undefined;
    if (options?.role === "solo") {
      this.playerSessionId = client.sessionId;
      const seat = new PlayerState();
      seat.playerId = client.sessionId;
      seat.playerName = typeof options.playerName === "string" ? options.playerName : "Пилот";
      seat.role = "pilot";
      seat.ready = true;
      seat.connected = true;
      this.state.players.set(client.sessionId, seat);
      // A screen that loads the match's assets holds the waiting room's count
      // until they are in, and for twenty seconds at most.
      const loads = options.loadsAssets === true;
      this.playerAssetsReady = loads ? false : undefined;
      this.assetWaitSecondsRemaining = loads ? ASSET_WAIT_SECONDS : 0;
    }
    this.connectionClients.set(client.sessionId, client);
    this.latency.register(client.sessionId);
    for (const [name, handler] of Object.entries(this.inputHandlers)) {
      this.onMessage(name, handler);
    }
    this.broadcastLobby();
  }

  /** The match leaves the server, and with it the records' count of rooms and people. */
  override onDispose(): void {
    getServerRecords().forget(this.statsId);
  }

  override onLeave(client?: Client): void {
    if (client !== undefined) {
      // Cleared while the seat is still the player's, so the latency reads unknown.
      this.latency.clear(client.sessionId);
      this.connectionClients.delete(client.sessionId);
      this.state.players.delete(client.sessionId);
    }
    // The seat goes back to the autopilot rather than standing still: a hull
    // nobody is flying is exactly the case the bot layer was written for.
    if (client !== undefined && client.sessionId === this.playerSessionId) {
      this.playerSessionId = undefined;
      // Nobody left to wait for: the queue counts on as it would without them.
      this.playerAssetsReady = undefined;
      this.assetWaitSecondsRemaining = 0;
      this.playerIntent = undefined;
      this.playerHeadingTarget = null;
      this.playerTurretTarget = null;
    }
    /*
     * A waiting room is its clients; a match is not.
     *
     * Nobody left in a queue means the queue is over and there is nothing to
     * keep. A started match keeps running with nobody watching, which is what
     * lets the other fifteen finish the fight the player just left.
     */
    if (this.clients.length === 0 && !this.started) {
      void this.disconnect();
      return;
    }
    if (this.clients.length === 0) {
      this.state.displayConnected = false;
      this.holdEmptyMatch();
    }
    // Somebody closing their tab has to leave the queue they were counted in.
    this.broadcastLobby();
  }

  /** One second of the waiting room, and the bot fill when it runs out. */
  private countDown(): void {
    if (this.started || this.botsSeated > 0) return;
    if (this.clients.length >= this.config.shipCount) {
      this.startMatch();
      return;
    }
    // The player's screen is still loading what the match draws and plays: the
    // queue's own count waits for it, but no longer than the asset wait lasts.
    if (this.playerAssetsReady === false && this.assetWaitSecondsRemaining > 0) {
      this.assetWaitSecondsRemaining -= 1;
      this.broadcastLobby();
      return;
    }
    this.waitSecondsRemaining = Math.max(0, this.waitSecondsRemaining - 1);
    if (this.waitSecondsRemaining === 0) {
      this.fillWithBots();
      return;
    }
    this.broadcastLobby();
  }

  /**
   * The empty seats, taken one at a time.
   *
   * Nothing about the match needs this - the bots exist the moment the match is
   * created - but a queue that fills seat by seat tells a player what happened
   * to the seven seconds they waited, and a jump from one to sixteen does not.
   */
  private fillWithBots(): void {
    const missing = this.config.shipCount - this.clients.length;
    if (missing <= 0) {
      this.startMatch();
      return;
    }
    const everyMs = Math.max(60, Math.round(ARENA_BOT_FILL_MS / missing));
    this.clock.setInterval(() => {
      if (this.started) return;
      this.botsSeated += 1;
      this.broadcastLobby();
      if (this.clients.length + this.botsSeated >= this.config.shipCount) this.startMatch();
    }, everyMs);
  }

  private startMatch(): void {
    if (this.started) return;
    this.started = true;
    this.waitSecondsRemaining = 0;
    this.state.phase = "active";
    this.state.runNumber = 1;
    this.state.hasGame = true;
    this.publish();
    this.broadcastLobby();
  }

  private broadcastLobby(): void {
    const payload: ArenaLobby = {
      protocolVersion: PROTOCOL_VERSION,
      players: this.clients.length,
      bots: this.botsSeated,
      capacity: this.config.shipCount,
      secondsRemaining: this.waitSecondsRemaining,
      started: this.started,
      awaitingAssets:
        !this.started && this.playerAssetsReady === false && this.assetWaitSecondsRemaining > 0
    };
    this.broadcast(serverMessage.arenaLobby, payload);
  }

  /**
   * Closes a started match that nobody came back to.
   *
   * On the room's own clock rather than a timer of its own: the clock is
   * cleared with the room, and a stray timer firing into a disposed room is the
   * shape of bug this file has had before.
   */
  private holdEmptyMatch(): void {
    if (this.emptySince !== undefined) return;
    this.emptySince = Date.now();
    this.clock.setTimeout(() => {
      if (this.emptySince === undefined) return;
      if (this.clients.length > 0) {
        this.emptySince = undefined;
        return;
      }
      void this.disconnect();
    }, EMPTY_MATCH_HOLD_MS);
  }

  /** What the dashboard calls this match right now. */
  private publishStats(): Promise<void> {
    if (this.statsId.length === 0) return Promise.resolve();
    const match = this.match;
    const status: RoomStatsStatus = !this.started
      ? "lobby"
      : match?.phase === "result"
        ? "result"
        : "combat";
    if (status !== this.statsStatus) {
      this.statsStatus = status;
      this.statusChangedAtMs = Date.now();
    }
    const metadata: RoomStatsMetadata = {
      statsId: this.statsId,
      mode: "arena",
      status,
      // One socket is one person here: an arena client is its own screen and
      // its own seat, unlike a campaign crew on a shared display.
      connections: this.clients.length,
      connectedPlayers: this.state.players.size,
      // Nobody is held for a reconnect in a match: a seat whose pilot left is
      // taken over by the autopilot rather than kept warm.
      reservedPlayers: 0,
      capacity: this.config.shipCount,
      displayConnected: this.clients.length > 0,
      createdAtMs: this.createdAtMs,
      statusChangedAtMs: this.statusChangedAtMs,
      // A match ends when it is decided, not on a clock the dashboard could
      // count down to.
      expiresAtMs: null
    };
    // The records count the same people the dashboard does, on the same heartbeat.
    getServerRecords().observe(metadata);
    return this.setMetadata(metadata).catch(() => {
      // Statistics are operational diagnostics and never affect a match.
    });
  }

  private step(): void {
    // Nothing moves until the waiting room closes: a match that ran while
    // people were still arriving would be decided before they sat down.
    if (!this.started) return;
    const match = this.match;
    const bots = this.bots;
    if (match === undefined || bots === undefined) return;
    if (match.phase === "result") return;

    const started = performance.now();
    // An empty seat keeps flying itself; a seated player's frame wins over
    // whatever the bot wanted for that hull.
    let player: ArenaShipIntent | null = null;
    if (this.playerSessionId !== undefined) {
      this.takeCockpitFrame(this.playerSessionId);
      player = this.playerIntent ?? IDLE_ARENA_INTENT;
    }
    this.match = stepArenaMatch(match, this.config, bots, player);
    this.holdForResult(this.match);
    this.state.game.display.serverStepMs = performance.now() - started;
    this.publish();
  }

  /**
   * One sweep of the dial, if one is due.
   *
   * Everything inside the radius is marked at once and the marks fade together:
   * a sweep is a photograph rather than a tracker, which is what makes it worth
   * spending and worth timing. A hull that has moved since is drawn where it
   * was found, and that is the point of the mechanic.
   */
  private sweep(): void {
    const match = this.match;
    if (match === undefined) return;
    const found = sweepArena(match, this.config, this.scan, this.scanReadyTick);
    if (found === undefined) return;
    this.revealed = found.revealed;
    this.scanReadyTick = found.readyTick;
    this.scanRevealedUntilTick = found.revealedUntilTick;
  }

  /**
   * The end of the match, and the only thing that closes this room.
   *
   * Started once, when the last hull standing is decided or the clock runs out.
   * Whoever is still connected gets a window to read the result; whoever has
   * already gone is not waited for.
   */
  private holdForResult(match: ArenaMatchState): void {
    if (this.closing || match.phase !== "result") return;
    this.closing = true;
    this.clock.setTimeout(() => {
      void this.disconnect();
    }, ARENA_RESULT_HOLD_MS);
  }

  /**
   * One cockpit frame per step, and never two.
   *
   * The client steps its own ship once for every frame it sends and replays
   * everything the room has not acknowledged; a room that spent two frames in
   * one step would acknowledge a state it never produced, and the replay would
   * start from a pose that does not exist. What is left in the buffer waits for
   * the next step, exactly as the campaign's helm does.
   */
  private takeCockpitFrame(sessionId: string): void {
    const frame = this.soloInputs.get(sessionId).next();
    if (frame === undefined) return;

    const cockpit = arenaIntentFromCockpit(
      {
        vector: { x: frame.vectorX, y: frame.vectorY },
        turn: frame.hasHelm ? frame.turn : null,
        thrust: frame.hasHelm ? frame.thrust : null,
        mgFiring: frame.mgFiring,
        aim: { x: frame.aimX, y: frame.aimY },
        aimTurn: frame.hasAimTurn ? frame.aimTurn : null,
        firing: frame.firing
      },
      { heading: this.playerHeadingTarget, turret: this.playerTurretTarget }
    );
    this.playerHeadingTarget = cockpit.held.heading;
    this.playerTurretTarget = cockpit.held.turret;
    this.playerIntent = cockpit.intent;
    this.appliedSoloSeq = frame.seq;
  }

  /**
   * The sheet, published only when it actually changed.
   *
   * Sixteen rectangles that move a few times a match have no business being
   * rebuilt sixty times a second: the signature is the states in order, and an
   * unchanged signature means the clients already have it. Colyseus would have
   * sent nothing either way - it diffs - but rebuilding the array would have
   * made it think everything changed.
   */
  private publishZones(match: ArenaMatchState): void {
    const signature = match.zones
      .map(
        (zone) => `${String(zone.id)}:${zone.state}:${String(Math.ceil(zone.ticksRemaining / 60))}`
      )
      .join("|");
    if (signature === this.zoneSignature) return;
    this.zoneSignature = signature;

    const target = this.state.game.display.arenaZones;
    target.clear();
    for (const zone of match.zones) {
      const view = new ArenaZoneView();
      view.zoneId = zone.id;
      view.x = zone.x;
      view.y = zone.y;
      view.width = zone.width;
      view.height = zone.height;
      view.state = zone.state;
      view.secondsRemaining = Math.ceil(
        (zone.ticksRemaining * this.config.ship.fixedStepMs) / 1_000
      );
      target.push(view);
    }
  }

  /** Mirrors the match into the campaign-shaped state, by id. */
  private publish(): void {
    const match = this.match;
    if (match === undefined) return;
    const game = this.state.game;

    const player = match.ships[ARENA_PLAYER_SLOT];

    game.tick = match.clock.tick;
    game.elapsedMs = Math.round(match.clock.elapsedMs);
    // Where the cockpit's replay starts. Left at zero it would count every
    // frame it ever sent as still in flight, and replay all of them.
    game.display.appliedInputSeq = this.appliedSoloSeq;
    game.arenaRadius = Math.round(this.config.arenaRadius);
    /*
     * A match ends for a player when their hull does, not when the field is
     * down to one.
     *
     * Fifteen bots go on fighting after a human is shot down, and the room is
     * right to keep stepping them - but the person watching has lost, and
     * holding the picture in "combat" until the last bot falls is why the
     * result only ever arrived with the room closing. The flags matter as much
     * as the values: the view reads `outcome` as absent unless `hasOutcome`
     * says otherwise, so an outcome written without them is an outcome nobody
     * is shown.
     */
    const eliminated = this.playerSessionId !== undefined && player !== undefined && !player.alive;
    game.encounter.phase = match.phase === "result" || eliminated ? "result" : "combat";
    game.encounter.encounterTick = match.clock.tick;
    /*
     * Kills, carried on the field the campaign calls a score.
     *
     * The arena publishes through the campaign's shape on purpose, and "how
     * well did I do" is what this field is for in both modes - it is a count of
     * wrecks with my name on them here and a count of points there. Counted
     * from `eliminatedBy` rather than tallied as it happens, because the match
     * already records who ended whom and a second tally could disagree with it.
     */
    game.encounter.score =
      player === undefined
        ? 0
        : match.ships.filter((ship) => !ship.alive && ship.eliminatedBy === player.id).length;
    /*
     * The clock, and only while there is one.
     *
     * The contract wants a positive countdown during combat and none outside
     * it - "only combat may publish a wave countdown" - and a match kept
     * publishing its own after the fight was decided. That is a refusal, not a
     * warning: the view stops parsing and the screen holds its last good
     * snapshot, which is a frozen picture at the exact moment of winning.
     */
    game.encounter.waveSecondsRemaining =
      game.encounter.phase === "combat"
        ? Math.max(
            1,
            Math.ceil(
              ((this.config.matchTickLimit - match.clock.tick) * this.config.ship.fixedStepMs) /
                1_000
            )
          )
        : 0;
    // The room stays "active": a finished match is an encounter outcome, and
    // the room phase only knows lobby and active.
    if (eliminated) {
      game.encounter.hasOutcome = true;
      game.encounter.outcome = "defeat";
      game.encounter.hasDefeatReason = true;
      game.encounter.defeatReason = "spaceship_destroyed";
    } else if (match.phase === "result") {
      // Somebody winning is not the same as this somebody winning: with a
      // player in the field the outcome is theirs, and only an unmanned screen
      // reports the match's own.
      const won =
        this.playerSessionId === undefined
          ? match.winnerShipId !== null
          : match.winnerShipId === player?.id;
      game.encounter.hasOutcome = true;
      game.encounter.outcome = won ? "victory" : "defeat";
      /*
       * A defeat has to say why, and the contract enforces it both ways: a
       * reason without a defeat is refused as loudly as a defeat without one,
       * and a refusal freezes the screen on its last good snapshot. Reaching
       * this branch alive means the clock ran out - being shot down is the
       * branch above.
       */
      game.encounter.hasDefeatReason = !won;
      game.encounter.defeatReason = "wave_timeout";
    }

    /*
     * The sweep's two clocks, in seconds because that is what a button shows.
     * The marks are cleared rather than left to rot: a stale reveal would put a
     * hull on the dial in a place it left a minute ago.
     */
    const fresh = match.clock.tick < this.scanRevealedUntilTick;
    if (!fresh && this.revealed.size > 0) this.revealed.clear();
    const secondsOf = (ticks: number): number =>
      Math.max(0, Math.ceil((ticks * this.config.ship.fixedStepMs) / 1_000));
    game.display.scanReadySeconds = secondsOf(this.scanReadyTick - match.clock.tick);
    game.display.scanRevealSecondsRemaining = secondsOf(
      this.scanRevealedUntilTick - match.clock.tick
    );

    this.publishZones(match);

    if (player !== undefined) mirrorPlayerShip(player, game);

    /*
     * Every hull, whole.
     *
     * The rivals used to travel as enemy entities, which is what the campaign
     * has room for - a position, a heading and a health bar. They are not
     * enemies: each is a copy of the crew's own ship, shield and turret
     * included, flown by the same autopilot, and the display has to be able to
     * draw them that way.
     */
    /*
     * Wrecks travel too, for a while.
     *
     * Dropping a hull the instant it died meant its health bar never reached
     * zero and the ship blinked out instead of dying - the last rival of a
     * match simply ceased to exist, which is no way to learn that you won. It
     * stays on the wire with `alive` false until the display has played the
     * wreck, and the room lets go of it a couple of seconds later.
     */
    const fleet = new Map(
      match.ships
        .filter(
          (ship) =>
            ship.alive ||
            ship.eliminatedAtTick === null ||
            match.clock.tick - ship.eliminatedAtTick <= WRECK_HOLD_TICKS
        )
        .map((ship) => [ship.id, ship])
    );
    reconcile(
      game.display.arenaShips,
      fleet,
      (ship) => {
        const view = new ArenaShipView();
        view.entityId = ship.id;
        view.isSelf = ship.slot === ARENA_PLAYER_SLOT;
        return view;
      },
      (view, ship) => {
        view.x = ship.spaceship.x;
        view.y = ship.spaceship.y;
        view.velocityX = ship.spaceship.velocity.x;
        view.velocityY = ship.spaceship.velocity.y;
        view.radius = ship.stats.spaceshipRadius;
        view.heading = ship.heading;
        view.turretAngle = ship.turretAngle;
        view.hp = ship.hp;
        view.maxHp = ship.maxHp;
        view.shieldAngle = ship.shieldAngle;
        view.shieldActive = ship.shieldActive;
        view.shieldRadius = ship.stats.shieldRadius;
        view.shieldArcHalfAngle = ship.stats.shieldArcRadians / 2;
        view.shieldEnergy = ship.shieldEnergy;
        view.shieldCapacity = ship.stats.shieldCapacity;
        view.revealed = fresh && this.revealed.has(ship.id);
        view.alive = ship.alive;
        // Narrowed to the wire's counter, which wraps; the display compares
        // against what it last drew, so a wrap costs one missed flash.
        view.shotsFired = ship.shotsFired % 65_536;
        view.shieldBlocks = ship.shieldBlocks % 65_536;
      }
    );

    /*
     * The field's drops, reconciled by id like everything else.
     *
     * Position never changes once a drop is put down, so this is a create and a
     * delete and nothing in between - the update writes the same numbers back
     * and Colyseus sends none of them.
     */
    reconcile(
      game.display.arenaLoot,
      new Map(match.loot.map((drop) => [drop.id, drop] as const)),
      (drop, id) => {
        const view = new ArenaLootView();
        view.entityId = id;
        view.kind = drop.kind;
        view.x = drop.x;
        view.y = drop.y;
        return view;
      },
      (view, drop) => {
        view.x = drop.x;
        view.y = drop.y;
        /*
         * The heavy drop is on every dial from the moment it lands.
         *
         * It is worth crossing the field for, which only works if everyone
         * knows it is there: a cargo nobody can see is a prize one lucky sweep
         * collects, and a cargo everyone can see is a fight with a time and a
         * place. The common two stay behind the sweep, which is what the sweep
         * is for.
         */
        view.revealed = drop.kind === "cargo" || (fresh && this.revealed.has(drop.id));
        // The circle and how much of the hold is served: the display draws a
        // ring from the pair, and neither is worth computing twice.
        view.captureRadius = this.config.ship.spaceshipRadius * this.config.lootCaptureRadiusHulls;
        view.captureShare = Math.max(
          0,
          Math.min(1, drop.captureTicks / Math.max(1, this.config.lootCaptureTicks))
        );
      }
    );

    const mine = new Map(
      match.projectiles
        .filter((shot) => shot.ownerShipId === player?.id)
        .map((shot) => [shot.id, shot] as const)
    );
    const theirs = new Map(
      match.projectiles
        .filter((shot) => shot.ownerShipId !== player?.id)
        .map((shot) => [shot.id, shot] as const)
    );
    /*
     * Both sides fire the same ship, so both sides fire the same shell: a
     * match is sixteen copies of the crew's own hull, and a rival's tracer
     * being a different colour from yours would be a lie about the weapon.
     */
    const look = {
      cannon: this.config.ship.projectileVisual,
      machineGun: this.config.ship.mgProjectileVisual
    };
    mirrorProjectiles(game.display.friendlyProjectiles, mine, "friendly", look);
    mirrorProjectiles(game.display.hostileProjectiles, theirs, "hostile", look);
  }
}

/** A stick reading is a direction; the simulation wants the bearing of it. */
function bearingOf(vector: { readonly x: number; readonly y: number }): number | null {
  if (vector.x === 0 && vector.y === 0) return null;
  return Math.atan2(vector.y, vector.x);
}

function mirrorPlayerShip(ship: ArenaShipState, game: SpaceshipDefenderState["game"]): void {
  // The arena already thinks in world coordinates, the same ones the display
  // draws in, so nothing is translated here any more.
  game.spaceship.x = ship.spaceship.x;
  game.spaceship.y = ship.spaceship.y;
  game.spaceship.velocityX = ship.spaceship.velocity.x;
  game.spaceship.velocityY = ship.spaceship.velocity.y;
  game.spaceship.radius = ship.stats.spaceshipRadius;
  game.spaceship.hp = ship.hp;
  game.spaceship.maxHp = ship.maxHp;
  game.spaceship.heading = ship.heading;
  game.turretAngle = ship.turretAngle;
  game.shield.angle = ship.shieldAngle;
  game.shield.active = ship.shieldActive;
  game.shield.energy = ship.shieldEnergy;
  game.shield.capacity = ship.stats.shieldCapacity;
  game.shield.arcHalfAngle = ship.stats.shieldArcRadians / 2;
  game.cannon.heat = ship.cannonHeat;
  game.cannon.capacity = ship.stats.cannonHeatCapacity;
  game.cannon.overheated = ship.cannonOverheated;
  game.machineGun.heat = ship.mgHeat;
  game.machineGun.capacity = ship.stats.mgHeatCapacity;
  game.machineGun.overheated = ship.mgOverheated;
  game.display.shieldRadius = ship.stats.shieldRadius;
  game.display.shieldPhase = ship.shieldPhase;
  const pose = game.display.pose;
  pose.x = game.spaceship.x;
  pose.y = game.spaceship.y;
  pose.velocityX = ship.spaceship.velocity.x;
  pose.velocityY = ship.spaceship.velocity.y;
  pose.heading = ship.heading;
  pose.turretAngle = ship.turretAngle;
}

/** A shell's drawn look, as narrow as this file needs it: a shape and a size. */
type ShellLook = { readonly shape: string; readonly modelScale: number } | null;

function mirrorProjectiles(
  target: MapSchema<ProjectileState>,
  source: ReadonlyMap<
    string,
    {
      x: number;
      y: number;
      velocity: { x: number; y: number };
      radius: number;
      spawnSequence: number;
      source: "cannon" | "machineGun";
    }
  >,
  kind: "friendly" | "hostile",
  /** The look each barrel's shell is drawn with, as the console chose it. */
  look: { readonly cannon: ShellLook; readonly machineGun: ShellLook }
): void {
  reconcile(
    target,
    source,
    (shot, id) => {
      const entity = new ProjectileState();
      entity.entityId = id;
      entity.spawnSequence = shot.spawnSequence;
      entity.kind = kind;
      /*
       * Set once at spawn, like the campaign does it: a shell's look never
       * changes, so it costs nothing per tick - and without it every shot in a
       * match came out as the display's own fallback dot rather than the
       * sprite the operator chose on the player screen.
       */
      /*
       * Whose barrel this came out of, and only when it is ours.
       *
       * The display reads this field to place the crew's own muzzle flash: a
       * shell that arrives naming a barrel is a shell this ship just fired. A
       * match publishes fifteen other hulls' shots as well, and naming their
       * barrels too drew a flash on the player's own gun for every shot anyone
       * on the field took - which is a muzzle that never stops firing. The
       * campaign's own mirror has always emptied it for hostile shells.
       */
      entity.source = kind === "friendly" ? shot.source : "";
      const visual = shot.source === "machineGun" ? look.machineGun : look.cannon;
      entity.visualShape = visual?.shape ?? "";
      entity.visualScale = visual?.modelScale ?? 1;
      return entity;
    },
    (entity, shot) => {
      entity.x = shot.x;
      entity.y = shot.y;
      entity.velocityX = shot.velocity.x;
      entity.velocityY = shot.velocity.y;
      entity.radius = shot.radius;
    }
  );
}

/** Create, update and delete by id - the same shape the campaign room syncs with. */
function reconcile<TEntity, TSource>(
  target: MapSchema<TEntity>,
  source: ReadonlyMap<string, TSource>,
  create: (item: TSource, id: string) => TEntity,
  update: (entity: TEntity, item: TSource) => void
): void {
  for (const [id, item] of source) {
    let entity = target.get(id);
    if (entity === undefined) {
      entity = create(item, id);
      target.set(id, entity);
    }
    update(entity, item);
  }
  for (const id of [...target.keys()]) {
    if (!source.has(id)) target.delete(id);
  }
}
