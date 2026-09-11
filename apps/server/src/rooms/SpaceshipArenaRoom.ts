import { Room, type Client } from "colyseus";
import { StateView, type MapSchema } from "@colyseus/schema";
import {
  ARENA_SHIP_COUNT,
  IDLE_ARENA_INTENT,
  advanceArenaMatch,
  canonicalizeAngle,
  createArenaMatch,
  defaultArenaMatchConfig,
  normalizeVector,
  type ArenaMatchConfig,
  type ArenaMatchState,
  type ArenaShipSeat,
  type ArenaShipState
} from "@spaceship-defender/game-core";
import {
  ARENA_BOT_FILL_MS,
  ARENA_LOBBY_WAIT_SECONDS,
  CAMERA_VIEW_WIDTH_MAX,
  PATCH_INTERVAL_MS,
  PROTOCOL_VERSION,
  SOLO_INPUT_BUFFER_SIZE,
  SOLO_INPUT_RANGES,
  SoloInput,
  clientMessage,
  gunnerInputCommandSchema,
  pilotInputCommandSchema,
  serverMessage,
  shieldInputCommandSchema,
  type ArenaLobby
} from "@spaceship-defender/protocol";

import { getBalanceStore } from "../balance/index.js";
import { ArenaBots } from "./arenaBots.js";
import { createRunSeed } from "./runSeed.js";
import type { ArenaShipIntent } from "@spaceship-defender/game-core";

import {
  ArenaShipView,
  ArenaZoneView,
  DISPLAY_VIEW_TAG,
  PlayerState,
  ProjectileState,
  SpaceshipDefenderState
} from "./SpaceshipDefenderState.js";
import { leadSpeedFor, resolveAutopilotProfile } from "./crewPolicy.mjs";

/** The slot the human takes. It flies on autopilot until a cockpit claims it. */
const PLAYER_SLOT = 0;

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
  /** Seconds left in the waiting room; the match starts when it reaches zero. */
  private waitSecondsRemaining = ARENA_LOBBY_WAIT_SECONDS;
  private started = false;
  /** Seats taken by bots so far, while the fill animation runs. */
  private botsSeated = 0;
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
    const ship = balance.getActiveSimulationConfig(tuning.defaultShipArchetypeId);
    this.state.shipArchetypeId = tuning.defaultShipArchetypeId;
    this.config = {
      ...defaultArenaMatchConfig,
      ship,
      arenaRadius: ship.arenaRadius,
      // The operator's layout, edited on the console's arena screen. Absent
      // marks would mean the built-in spiral, which is what they started as.
      spawnMarks: tuning.arena.spawnMarks,
      // The sheet is the operator's too: its rectangles are sized from the
      // radius, so a wider arena keeps the same number of closures.
      zoneColumns: tuning.arena.zoneColumns,
      zoneRows: tuning.arena.zoneRows,
      // How long the fight is allowed to last, straight from the console: the
      // sheet and the clock are one setting in two halves, and a match shorter
      // than the sheet ends with ground still safe.
      matchTickLimit: tuning.arena.matchTickLimit,
      zoneIntervalTicks: tuning.arena.zoneIntervalTicks,
      zoneWarningTicks: tuning.arena.zoneWarningTicks,
      zoneDamageIntervalTicks: tuning.arena.zoneDamageIntervalTicks,
      // The operator decides how many beats a full hull takes; the simulation
      // takes one over that, of the maximum, on each of them.
      zoneDamageShareOfMaxHp: 1 / tuning.arena.zoneBitesToKill
    };

    const seats: readonly ArenaShipSeat[] = Array.from(
      { length: this.config.shipCount },
      (_unused, slot): ArenaShipSeat => ({
        // The player's slot is marked human at creation; the bot layer skips
        // it, and an empty one is simply a human who never turned up, which
        // the step handles by leaving the hull on its own autopilot.
        control: slot === PLAYER_SLOT ? "human" : "bot",
        botLevel: tuning.autopilot.level
      })
    );
    this.match = createArenaMatch(this.config, createRunSeed(undefined), seats);
    this.bots = new ArenaBots(
      this.config,
      resolveAutopilotProfile(tuning.autopilot, tuning.autopilot.level, ship.cannonWeaponKind)
    );

    this.state.game.worldWidth = ship.worldWidth;
    this.state.game.worldHeight = ship.worldHeight;
    this.state.game.encounter.phase = "combat";
    this.state.game.encounter.waveNumber = 1;
    // The campaign frames a fight around one ship; a match is sixteen of them
    // spread over the whole disc, so the arena watches the arena.
    /*
     * As much of the disc as the contract allows.
     *
     * A match wants the whole field in frame, but the camera width is capped
     * by the balance schema - and an arena larger than that cap simply cannot
     * be shown whole. Clamping here rather than widening the cap: the number
     * is shared with the campaign, where a frame that size is a different
     * decision entirely.
     */
    this.state.game.display.cameraViewWidth = Math.min(
      CAMERA_VIEW_WIDTH_MAX,
      this.config.arenaRadius * 2
    );
    this.state.game.display.spaceshipVisualShape = ship.spaceshipVisual?.shape ?? "";
    this.state.game.display.spaceshipVisualScale = ship.spaceshipVisual?.modelScale ?? 1;
    this.state.game.display.shieldRadius = ship.shieldRadius;
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

    // One tick a second for the waiting room, which is what its display shows.
    this.clock.setInterval(() => {
      this.countDown();
    }, 1_000);
    this.broadcastLobby();
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
    [clientMessage.shieldInput]: (_client: Client, payload: unknown) => {
      const parsed = shieldInputCommandSchema.safeParse(payload);
      if (!parsed.success) return;
      this.playerIntent = {
        ...(this.playerIntent ?? IDLE_ARENA_INTENT),
        shieldTargetAngle: bearingOf(parsed.data.aim),
        shieldActive: parsed.data.active
      };
    }
  };

  override onJoin(client: Client, unsafeOptions?: unknown): void {
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
    const options = unsafeOptions as { role?: unknown; playerName?: unknown } | undefined;
    if (options?.role === "solo") {
      this.playerSessionId = client.sessionId;
      const seat = new PlayerState();
      seat.playerId = client.sessionId;
      seat.playerName = typeof options.playerName === "string" ? options.playerName : "Пилот";
      seat.role = "pilot";
      seat.ready = true;
      seat.connected = true;
      this.state.players.set(client.sessionId, seat);
    }
    for (const [name, handler] of Object.entries(this.inputHandlers)) {
      this.onMessage(name, handler);
    }
    this.broadcastLobby();
  }

  override onLeave(client?: Client): void {
    if (client !== undefined) this.state.players.delete(client.sessionId);
    // The seat goes back to the autopilot rather than standing still: a hull
    // nobody is flying is exactly the case the bot layer was written for.
    if (client !== undefined && client.sessionId === this.playerSessionId) {
      this.playerSessionId = undefined;
      this.playerIntent = undefined;
      this.playerHeadingTarget = null;
    }
    if (this.clients.length === 0) this.state.displayConnected = false;
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
      started: this.started
    };
    this.broadcast(serverMessage.arenaLobby, payload);
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
    const intents = new Map(bots.intentsFor(match, this.config));
    const player = match.ships[PLAYER_SLOT];
    // The seated player's own frame wins over whatever the bot wanted for that
    // hull, and an empty seat keeps flying itself.
    if (this.playerSessionId !== undefined && player !== undefined) {
      this.takeCockpitFrame(this.playerSessionId);
      const autopilot = intents.get(player.id) ?? IDLE_ARENA_INTENT;
      intents.set(player.id, {
        ...(this.playerIntent ?? IDLE_ARENA_INTENT),
        /*
         * The shield stays with the autopilot, because the cockpit has no
         * control for it. A solo seat in the campaign is helm and gun - the
         * sector is a third pair of hands, and an empty crew seat is what the
         * policy layer exists to fill. Taking it away here would simply mean
         * nobody ever raises it.
         */
        shieldTargetAngle: autopilot.shieldTargetAngle,
        shieldActive: autopilot.shieldActive
      });
    }
    this.match = advanceArenaMatch(match, intents, this.config);
    this.state.game.display.serverStepMs = performance.now() - started;
    this.publish();
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

    const drive = { x: frame.vectorX, y: frame.vectorY };
    const helmTurn = frame.hasHelm ? frame.turn : null;
    const aimTurn = frame.hasAimTurn ? frame.aimTurn : null;
    this.playerHeadingTarget = heldTarget(drive, helmTurn, this.playerHeadingTarget);
    this.playerTurretTarget = heldTarget(
      { x: frame.aimX, y: frame.aimY },
      aimTurn,
      this.playerTurretTarget
    );

    this.playerIntent = {
      // Normalised the way the room stores it, so both sides step the same
      // vector rather than one a fraction longer.
      driveVector: normalizeVector(drive),
      turn: helmTurn,
      thrust: frame.hasHelm ? frame.thrust : null,
      headingTargetAngle: this.playerHeadingTarget,
      turretTargetAngle: this.playerTurretTarget,
      turretTurn: aimTurn,
      firing: frame.firing,
      mgFiring: frame.mgFiring,
      // Filled from the autopilot by the caller; the cockpit has no sector.
      shieldTargetAngle: null,
      shieldActive: false
    };
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

    const player = match.ships[PLAYER_SLOT];

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
    // The contract wants a positive countdown during combat, and a match has
    // exactly one: what is left of its own clock.
    game.encounter.waveSecondsRemaining = Math.max(
      1,
      Math.ceil(
        ((this.config.matchTickLimit - match.clock.tick) * this.config.ship.fixedStepMs) / 1_000
      )
    );
    // The room stays "active": a finished match is an encounter outcome, and
    // the room phase only knows lobby and active.
    if (eliminated) {
      game.encounter.hasOutcome = true;
      game.encounter.outcome = "defeat";
      game.encounter.hasDefeatReason = true;
      game.encounter.defeatReason = "spaceship_destroyed";
    } else if (match.phase === "result") {
      game.encounter.hasOutcome = true;
      // Somebody winning is not the same as this somebody winning: with a
      // player in the field the outcome is theirs, and only an unmanned screen
      // reports the match's own.
      game.encounter.outcome =
        this.playerSessionId === undefined
          ? match.winnerShipId === null
            ? "defeat"
            : "victory"
          : match.winnerShipId === player?.id
            ? "victory"
            : "defeat";
    }

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
    const fleet = new Map(match.ships.filter((ship) => ship.alive).map((ship) => [ship.id, ship]));
    reconcile(
      game.display.arenaShips,
      fleet,
      (ship) => {
        const view = new ArenaShipView();
        view.shipId = ship.id;
        view.isSelf = ship.slot === PLAYER_SLOT;
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
    mirrorProjectiles(game.display.friendlyProjectiles, mine, "friendly");
    mirrorProjectiles(game.display.hostileProjectiles, theirs, "hostile");
  }
}

/** A stick reading is a direction; the simulation wants the bearing of it. */
function bearingOf(vector: { readonly x: number; readonly y: number }): number | null {
  if (vector.x === 0 && vector.y === 0) return null;
  return Math.atan2(vector.y, vector.x);
}

/**
 * The bearing a stick names, or the one it named last.
 *
 * The client's own replay resolves it exactly this way, and it has to: a rate
 * command names no bearing at all, and a released stick sends a zero vector,
 * which is not "point north" but "keep going where you were pointed".
 */
function heldTarget(
  vector: { readonly x: number; readonly y: number },
  turn: number | null,
  previous: number | null
): number | null {
  if (turn !== null) return null;
  const normalized = normalizeVector(vector);
  const bearing = bearingOf(normalized);
  return bearing === null ? previous : canonicalizeAngle(bearing);
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
    }
  >,
  kind: "friendly" | "hostile"
): void {
  reconcile(
    target,
    source,
    (shot, id) => {
      const entity = new ProjectileState();
      entity.entityId = id;
      entity.spawnSequence = shot.spawnSequence;
      entity.kind = kind;
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
