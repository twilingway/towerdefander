import { Room, type Client } from "colyseus";
import { StateView, type MapSchema } from "@colyseus/schema";
import {
  ARENA_SHIP_COUNT,
  advanceArenaMatch,
  createArenaMatch,
  defaultArenaMatchConfig,
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
  serverMessage,
  type ArenaLobby
} from "@spaceship-defender/protocol";

import { getBalanceStore } from "../balance/index.js";
import { ArenaBots } from "./arenaBots.js";
import { createRunSeed } from "./runSeed.js";
import {
  ArenaZoneView,
  DISPLAY_VIEW_TAG,
  EnemyState,
  ProjectileState,
  SpaceshipDefenderState
} from "./SpaceshipDefenderState.js";
import { leadSpeedFor, resolveAutopilotProfile } from "./crewPolicy.mjs";

/** The slot the human takes. It flies on autopilot until a cockpit claims it. */
const PLAYER_SLOT = 0;

/** Where hull sequence numbers start, clear of the shots' own numbering. */
const SHIP_SEQUENCE_BASE = 900_000;

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
      spawnMarks: tuning.arena.spawnMarks
    };

    const seats: readonly ArenaShipSeat[] = Array.from(
      { length: this.config.shipCount },
      (): ArenaShipSeat => ({ control: "bot", botLevel: tuning.autopilot.level })
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

  override onJoin(client: Client): void {
    // Everyone watching gets the world branch: the arena has no controller
    // panels of its own yet, so there is nothing to gate off anybody.
    const view = (client.view ??= new StateView());
    view.add(this.state.game, DISPLAY_VIEW_TAG);
    this.state.displayConnected = true;
    this.broadcastLobby();
  }

  override onLeave(): void {
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
    this.match = advanceArenaMatch(match, bots.intentsFor(match, this.config), this.config);
    this.state.game.display.serverStepMs = performance.now() - started;
    this.publish();
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

    game.tick = match.clock.tick;
    game.elapsedMs = Math.round(match.clock.elapsedMs);
    game.arenaRadius = Math.round(this.config.arenaRadius);
    game.encounter.phase = match.phase === "result" ? "result" : "combat";
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
    if (match.phase === "result") {
      game.encounter.outcome = match.winnerShipId === null ? "defeat" : "victory";
    }

    this.publishZones(match);

    const player = match.ships[PLAYER_SLOT];
    if (player !== undefined) mirrorPlayerShip(player, game);

    const rivals = new Map(
      match.ships
        .filter((ship) => ship.alive && ship.slot !== PLAYER_SLOT)
        .map((ship) => [ship.id, ship] as const)
    );
    reconcile(
      game.display.enemyShips,
      rivals,
      (ship) => {
        const entity = new EnemyState();
        entity.entityId = ship.id;
        // Globally unique across every entity on the wire, which the display
        // contract checks: a hull's slot and a shot's sequence both start at
        // zero, and the two collections share one numbering.
        entity.spawnSequence = SHIP_SEQUENCE_BASE + ship.slot;
        entity.kind = "gunship";
        return entity;
      },
      (entity, ship) => {
        entity.x = ship.spaceship.x;
        entity.y = ship.spaceship.y;
        entity.velocityX = ship.spaceship.velocity.x;
        entity.velocityY = ship.spaceship.velocity.y;
        entity.radius = ship.stats.spaceshipRadius;
        entity.heading = ship.heading;
        entity.hp = ship.hp;
        entity.maxHp = ship.maxHp;
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
