import type {
  ArenaLootKind,
  ArenaMatchConfig,
  ArenaMatchState,
  ArenaShipState
} from "@spaceship-defender/game-core";
import {
  CAMERA_VIEW_WIDTH_MAX,
  type BalanceTuning,
  type ShieldPhase
} from "@spaceship-defender/protocol";

import type { ArenaScanState } from "./arenaRun.ts";
import { ARENA_PLAYER_SLOT } from "./arenaSetup.ts";
import { leadSpeedFor } from "./crewPolicy.mjs";
import type {
  KeyedCollection,
  ListCollection,
  ProjectileTarget,
  ProjectionTarget,
  ShipDriveTarget,
  ShipPoseTarget
} from "./projectionTarget.ts";
import { toHelmView, type HelmView } from "./runSetup.ts";

/**
 * A match as the display draws it, written into a target described by shape.
 *
 * The same rule as `stateProjection.ts`: the room's schema and a device's plain
 * mirror both satisfy this, so there is one projection of a match and not one
 * per host. What only a host can mean - the acknowledged cockpit frame, the
 * step cost, the hull's looks fixed at creation - is written by the host.
 */

/**
 * How long a wreck stays published after it stops flying.
 *
 * Long enough for the display to notice, play the explosion and let the health
 * bar be seen reaching zero; short enough that a match's collection is the
 * living field plus whatever just stopped being part of it.
 */
const WRECK_HOLD_TICKS = 120;

export interface ArenaShipTarget {
  entityId: string;
  isSelf: boolean;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  radius: number;
  heading: number;
  turretAngle: number;
  hp: number;
  maxHp: number;
  shieldAngle: number;
  shieldActive: boolean;
  shieldRadius: number;
  shieldArcHalfAngle: number;
  shieldEnergy: number;
  shieldCapacity: number;
  revealed: boolean;
  alive: boolean;
  shotsFired: number;
  shieldBlocks: number;
}

export interface ArenaLootTarget {
  entityId: string;
  kind: ArenaLootKind;
  x: number;
  y: number;
  revealed: boolean;
  captureRadius: number;
  captureShare: number;
}

export interface ArenaZoneTarget {
  zoneId: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** "safe" | "warning" | "closed"; the schema carries it as a string. */
  state: string;
  secondsRemaining: number;
}

export interface ArenaProjectionTarget {
  tick: number;
  elapsedMs: number;
  arenaRadius: number;
  turretAngle: number;
  spaceship: ProjectionTarget["spaceship"];
  shield: Omit<ProjectionTarget["shield"], "rearmRequired">;
  cannon: Pick<ProjectionTarget["cannon"], "heat" | "capacity" | "overheated">;
  machineGun: Pick<ProjectionTarget["machineGun"], "heat" | "capacity" | "overheated">;
  encounter: ProjectionTarget["encounter"];
  display: {
    shieldRadius: number;
    shieldPhase: ShieldPhase;
    pose: Pick<ShipPoseTarget, "x" | "y" | "velocityX" | "velocityY" | "heading" | "turretAngle">;
    scanReadySeconds: number;
    scanRevealSecondsRemaining: number;
    arenaZones: ListCollection<ArenaZoneTarget>;
    arenaShips: KeyedCollection<ArenaShipTarget>;
    arenaLoot: KeyedCollection<ArenaLootTarget>;
    friendlyProjectiles: KeyedCollection<ProjectileTarget>;
    hostileProjectiles: KeyedCollection<ProjectileTarget>;
  };
}

/** How a target makes a new element; the schema needs its own classes. */
export interface ArenaProjectionFactories {
  ship(): ArenaShipTarget;
  loot(): ArenaLootTarget;
  zone(): ArenaZoneTarget;
  projectile(): ProjectileTarget;
}

export interface ArenaProjectionContext {
  /** Whether a person holds the player's seat; an unmanned screen only watches. */
  readonly seated: boolean;
  readonly scan: ArenaScanState;
}

/** What the projection remembers between two calls; one per target. */
export interface ArenaProjectionMemo {
  /** The last sheet published, as a string; see `projectZones`. */
  zoneSignature: string;
}

export function createArenaProjectionMemo(): ArenaProjectionMemo {
  return { zoneSignature: "" };
}

/** Plain objects, for a target that is not a schema. */
export const PLAIN_ARENA_PROJECTION_FACTORIES: ArenaProjectionFactories = {
  ship: () => ({
    entityId: "",
    isSelf: false,
    x: 0,
    y: 0,
    velocityX: 0,
    velocityY: 0,
    radius: 0,
    heading: 0,
    turretAngle: 0,
    hp: 0,
    maxHp: 0,
    shieldAngle: 0,
    shieldActive: false,
    shieldRadius: 0,
    shieldArcHalfAngle: 0,
    shieldEnergy: 0,
    shieldCapacity: 0,
    revealed: false,
    alive: true,
    shotsFired: 0,
    shieldBlocks: 0
  }),
  loot: () => ({
    entityId: "",
    kind: "ammo",
    x: 0,
    y: 0,
    revealed: false,
    captureRadius: 0,
    captureShare: 0
  }),
  zone: () => ({
    zoneId: 0,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    state: "safe",
    secondsRemaining: 0
  }),
  projectile: () => ({
    entityId: "",
    spawnSequence: 0,
    spawnTick: 0,
    kind: "friendly",
    x: 0,
    y: 0,
    velocityX: 0,
    velocityY: 0,
    radius: 0,
    source: "",
    visualShape: "",
    visualScale: 1
  })
};

/** What a match fixes once, at creation: the field, the hull's looks, the helm. */
export interface ArenaFixturesTarget {
  worldWidth: number;
  worldHeight: number;
  helm: HelmView;
  cannon: Pick<ProjectionTarget["cannon"], "kind" | "reach">;
  encounter: Pick<ProjectionTarget["encounter"], "phase" | "waveNumber">;
  display: {
    cameraViewWidth: number;
    spaceshipVisualShape: string;
    spaceshipVisualScale: number;
    turretVisualShape: string;
    turretVisualScale: number;
    turretMountX: number;
    turretMountY: number;
    turretPivotX: number;
    turretPivotY: number;
    machineGunVisualShape: string;
    machineGunVisualScale: number;
    machineGunMountX: number;
    machineGunMountY: number;
    machineGunPivotX: number;
    machineGunPivotY: number;
    asteroidVisualShape: string;
    asteroidVisualScale: number;
    backgroundImage: string;
    backgroundParallaxStrength: number;
    shieldBandEffect: string;
    shieldImpactEffect: string;
    shipDeathEffect: string;
    shipMuzzleEffect: string;
    shipCannonSound: string;
    shipMgSound: string;
    shipHitSound: string;
    shipDeathSound: string;
    shieldRadius: number;
    drive: Omit<ShipDriveTarget, "revision">;
  };
}

/**
 * Everything about a match that does not change while it is fought.
 *
 * Written once, when the host creates the match; `projectArenaMatch` then keeps
 * the moving parts current.
 */
export function projectArenaFixtures(
  game: ArenaFixturesTarget,
  tuning: BalanceTuning,
  config: ArenaMatchConfig
): void {
  const ship = config.ship;
  game.worldWidth = ship.worldWidth;
  game.worldHeight = ship.worldHeight;
  game.encounter.phase = "combat";
  game.encounter.waveNumber = 1;
  /*
   * The same frame the campaign is played in, from the same setting.
   *
   * It used to frame the whole disc, which made a hull a third of the size it
   * is in the campaign and every distance a different distance: a player who
   * has learned one mode was handed another camera in the other. The field is
   * the radar's job - the whole point of putting it over the stick - and the
   * frame's job is to make a ship the size a ship is.
   */
  const display = game.display;
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
  const drive = display.drive;
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
   * Without it the sticks fall back on the defaults, and the two that matter
   * most are zero there: the dead zones. A thumb is never still, and two
   * pixels of slip on the ring is a couple of degrees of commanded heading -
   * the tremble the preset's dead zone exists to absorb. The mount flag
   * belongs here for the same reason: it decides what a stick bearing means,
   * and the client replays with it.
   */
  Object.assign(game.helm, toHelmView(tuning, ship));
  game.cannon.kind = ship.cannonWeaponKind;
  game.cannon.reach = leadSpeedFor(ship.cannonWeaponKind, ship.projectileSpeedPerSecond);
}

/** Mirrors the match into the campaign-shaped state, by id. */
export function projectArenaMatch(
  game: ArenaProjectionTarget,
  match: ArenaMatchState,
  config: ArenaMatchConfig,
  context: ArenaProjectionContext,
  memo: ArenaProjectionMemo,
  factories: ArenaProjectionFactories
): void {
  const player = match.ships[ARENA_PLAYER_SLOT];

  game.tick = match.clock.tick;
  game.elapsedMs = Math.round(match.clock.elapsedMs);
  game.arenaRadius = Math.round(config.arenaRadius);
  /*
   * A match ends for a player when their hull does, not when the field is
   * down to one.
   *
   * Fifteen bots go on fighting after a human is shot down, and the host is
   * right to keep stepping them - but the person watching has lost, and
   * holding the picture in "combat" until the last bot falls is why the
   * result only ever arrived with the room closing. The flags matter as much
   * as the values: the view reads `outcome` as absent unless `hasOutcome`
   * says otherwise, so an outcome written without them is an outcome nobody
   * is shown.
   */
  const eliminated = context.seated && player !== undefined && !player.alive;
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
          Math.ceil(((config.matchTickLimit - match.clock.tick) * config.ship.fixedStepMs) / 1_000)
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
    const won = !context.seated ? match.winnerShipId !== null : match.winnerShipId === player?.id;
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
   * A mark is only drawn while the reveal lasts: a stale one would put a hull
   * on the dial in a place it left a minute ago.
   */
  const scan = context.scan;
  const fresh = match.clock.tick < scan.revealedUntilTick;
  const secondsOf = (ticks: number): number =>
    Math.max(0, Math.ceil((ticks * config.ship.fixedStepMs) / 1_000));
  game.display.scanReadySeconds = secondsOf(scan.readyTick - match.clock.tick);
  game.display.scanRevealSecondsRemaining = secondsOf(scan.revealedUntilTick - match.clock.tick);

  projectZones(game, match, config, memo, factories);

  if (player !== undefined) projectPlayerShip(player, game);

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
   * wreck, and the host lets go of it a couple of seconds later.
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
      const view = factories.ship();
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
      view.revealed = fresh && scan.revealed.has(ship.id);
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
      const view = factories.loot();
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
      view.revealed = drop.kind === "cargo" || (fresh && scan.revealed.has(drop.id));
      // The circle and how much of the hold is served: the display draws a
      // ring from the pair, and neither is worth computing twice.
      view.captureRadius = config.ship.spaceshipRadius * config.lootCaptureRadiusHulls;
      view.captureShare = Math.max(
        0,
        Math.min(1, drop.captureTicks / Math.max(1, config.lootCaptureTicks))
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
    cannon: config.ship.projectileVisual,
    machineGun: config.ship.mgProjectileVisual
  };
  projectShots(game.display.friendlyProjectiles, mine, "friendly", look, factories);
  projectShots(game.display.hostileProjectiles, theirs, "hostile", look, factories);
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
function projectZones(
  game: ArenaProjectionTarget,
  match: ArenaMatchState,
  config: ArenaMatchConfig,
  memo: ArenaProjectionMemo,
  factories: ArenaProjectionFactories
): void {
  const signature = match.zones
    .map(
      (zone) => `${String(zone.id)}:${zone.state}:${String(Math.ceil(zone.ticksRemaining / 60))}`
    )
    .join("|");
  if (signature === memo.zoneSignature) return;
  memo.zoneSignature = signature;

  const target = game.display.arenaZones;
  target.splice(0, target.length);
  for (const zone of match.zones) {
    const view = factories.zone();
    view.zoneId = zone.id;
    view.x = zone.x;
    view.y = zone.y;
    view.width = zone.width;
    view.height = zone.height;
    view.state = zone.state;
    view.secondsRemaining = Math.ceil((zone.ticksRemaining * config.ship.fixedStepMs) / 1_000);
    target.push(view);
  }
}

function projectPlayerShip(ship: ArenaShipState, game: ArenaProjectionTarget): void {
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

function projectShots(
  target: KeyedCollection<ProjectileTarget>,
  source: ReadonlyMap<
    string,
    {
      x: number;
      y: number;
      velocity: { x: number; y: number };
      radius: number;
      spawnSequence: number;
      spawnedTick: number;
      source: "cannon" | "machineGun";
    }
  >,
  kind: "friendly" | "hostile",
  /** The look each barrel's shell is drawn with, as the console chose it. */
  look: { readonly cannon: ShellLook; readonly machineGun: ShellLook },
  factories: ArenaProjectionFactories
): void {
  reconcile(
    target,
    source,
    (shot, id) => {
      const entity = factories.projectile();
      entity.entityId = id;
      entity.spawnSequence = shot.spawnSequence;
      entity.spawnTick = shot.spawnedTick;
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
  target: KeyedCollection<TEntity>,
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
