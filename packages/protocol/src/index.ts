import { z } from "zod";

export * from "./enemyKinds.ts";
import {
  ENEMY_ARCHETYPE_ID_PATTERN,
  ENEMY_SHAPES,
  MAX_ENEMY_ARCHETYPES,
  MAX_ENEMY_ARCHETYPE_ID_LENGTH
} from "./enemyKinds.ts";

export const PROTOCOL_VERSION = 16 as const;
export const ROOM_TYPE = "spaceship_defender" as const;
export const PLAYER_CAPACITY = 3 as const;
export const CREW_ROLES = ["pilot", "gunner", "shield"] as const;
export const ENCOUNTER_PHASES = ["combat", "intermission", "result"] as const;
export const TERMINAL_OUTCOMES = ["defeat", "victory"] as const;
export const DEFEAT_REASONS = ["spaceship_destroyed", "wave_timeout"] as const;
export const WAVE_TTL_SECONDS = 20 * 60;
export const MAX_WAVE_TTL_SECONDS = 24 * 60 * 60;
export const PROJECTILE_KINDS = ["friendly", "hostile"] as const;
export const ROOM_CLOSING_REASONS = [
  "display_left",
  "display_reconnect_expired",
  "lobby_expired",
  "result_expired",
  "controllers_expired",
  "room_lifetime_expired"
] as const;
export const PROJECTILE_WORLD_PADDING = 256 as const;
export const INTERMISSION_DURATION_TICKS = 600 as const;
export const UPGRADE_OFFER_COUNT = 3 as const;
export const TEAM_UPGRADE_PRICE = 5 as const;
export const COMBAT_ENTITY_CAPS = {
  enemyShips: 40,
  asteroids: 16,
  hostileProjectiles: 96,
  homingMissiles: 12,
  friendlyProjectiles: 32,
  dynamicEntities: 196
} as const;

export const PILOT_UPGRADE_IDS = ["pilot_speed", "pilot_acceleration", "pilot_hull"] as const;
export const GUNNER_UPGRADE_IDS = [
  "gunner_damage",
  "gunner_cooldown",
  "gunner_projectile_speed"
] as const;
export const SHIELD_UPGRADE_IDS = ["shield_capacity", "shield_recharge", "shield_arc"] as const;
export const UPGRADE_IDS = [
  ...PILOT_UPGRADE_IDS,
  ...GUNNER_UPGRADE_IDS,
  ...SHIELD_UPGRADE_IDS
] as const;

export const clientRoleSchema = z.enum(["display", "controller"]);
export type ClientRole = z.infer<typeof clientRoleSchema>;
export const crewRoleSchema = z.enum(CREW_ROLES);
export type CrewRole = z.infer<typeof crewRoleSchema>;
export const roomPhaseSchema = z.enum(["lobby", "active"]);
export type RoomPhase = z.infer<typeof roomPhaseSchema>;
export const encounterPhaseSchema = z.enum(ENCOUNTER_PHASES);
export type EncounterPhase = z.infer<typeof encounterPhaseSchema>;
export const terminalOutcomeSchema = z.enum(TERMINAL_OUTCOMES);
export type TerminalOutcome = z.infer<typeof terminalOutcomeSchema>;
export const defeatReasonSchema = z.enum(DEFEAT_REASONS);
export type DefeatReason = z.infer<typeof defeatReasonSchema>;
export const enemyKindSchema = z
  .string()
  .min(1)
  .max(MAX_ENEMY_ARCHETYPE_ID_LENGTH)
  .regex(ENEMY_ARCHETYPE_ID_PATTERN, "Enemy kind must be a catalogue id.");
export type EnemyKind = z.infer<typeof enemyKindSchema>;
export const projectileKindSchema = z.enum(PROJECTILE_KINDS);
export type ProjectileKind = z.infer<typeof projectileKindSchema>;
export const PROJECTILE_SOURCES = ["cannon", "machineGun"] as const;
export const projectileSourceSchema = z.enum(PROJECTILE_SOURCES);
export type ProjectileSource = z.infer<typeof projectileSourceSchema>;
export const upgradeIdSchema = z.enum(UPGRADE_IDS);
export type UpgradeId = z.infer<typeof upgradeIdSchema>;

// Zod numbers reject NaN and infinities by default.
const finite = z.number();
const CIRCULAR_GEOMETRY_EPSILON = 1e-6;
const safeNonnegativeInteger = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const safePositiveInteger = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const entityId = z.string().min(1).max(64);

export const runNumberSchema = safeNonnegativeInteger;
export type RunNumber = z.infer<typeof runNumberSchema>;
export const activeRunNumberSchema = safePositiveInteger;

export const latencyMsSchema = z.number().int().min(0).max(5000).nullable();
export type LatencyMs = z.infer<typeof latencyMsSchema>;
export const vector2Schema = z
  .object({ x: finite.min(-1).max(1), y: finite.min(-1).max(1) })
  .strict();
export type Vector2 = z.infer<typeof vector2Schema>;

export const publicPlayerViewSchema = z
  .object({
    playerId: z.string().min(1),
    playerName: z.string().min(1).max(24),
    role: crewRoleSchema,
    ready: z.boolean(),
    connected: z.boolean(),
    latencyMs: latencyMsSchema
  })
  .strict();
export type PublicPlayerView = z.infer<typeof publicPlayerViewSchema>;

export const publicSpaceshipViewSchema = z
  .object({
    x: finite.nonnegative(),
    y: finite.nonnegative(),
    velocityX: finite,
    velocityY: finite,
    radius: finite.positive(),
    hp: finite.nonnegative(),
    maxHp: finite.positive(),
    heading: finite
  })
  .strict()
  .superRefine((value, context) => {
    if (value.hp > value.maxHp) issue(context, ["hp"], "Spaceship HP must not exceed max HP.");
  });
export type PublicSpaceshipView = z.infer<typeof publicSpaceshipViewSchema>;

export const publicShieldViewSchema = z
  .object({
    angle: finite,
    active: z.boolean(),
    energy: finite.nonnegative(),
    capacity: finite.nonnegative(),
    arcHalfAngle: finite.positive().max(Math.PI)
  })
  .strict()
  .superRefine((value, context) => {
    if (value.energy > value.capacity)
      issue(context, ["energy"], "Shield energy must not exceed capacity.");
  });
export type PublicShieldView = z.infer<typeof publicShieldViewSchema>;

export const publicMachineGunViewSchema = z
  .object({
    heat: finite.nonnegative(),
    capacity: finite.nonnegative(),
    overheated: z.boolean()
  })
  .strict()
  .superRefine((value, context) => {
    if (value.heat > value.capacity)
      issue(context, ["heat"], "Machine gun heat must not exceed capacity.");
  });
export type PublicMachineGunView = z.infer<typeof publicMachineGunViewSchema>;

export const publicEncounterViewSchema = z
  .object({
    phase: encounterPhaseSchema,
    outcome: terminalOutcomeSchema.nullable(),
    defeatReason: defeatReasonSchema.nullable(),
    waveNumber: safePositiveInteger,
    encounterTick: safeNonnegativeInteger,
    phaseTicksRemaining: z.number().int().min(0).max(INTERMISSION_DURATION_TICKS),
    waveSecondsRemaining: z.number().int().min(0).max(MAX_WAVE_TTL_SECONDS),
    score: safeNonnegativeInteger
  })
  .strict()
  .superRefine((value, context) => {
    if (value.phase === "intermission" && value.phaseTicksRemaining === 0)
      issue(context, ["phaseTicksRemaining"], "Intermission requires a positive countdown.");
    if (value.phase !== "intermission" && value.phaseTicksRemaining !== 0)
      issue(context, ["phaseTicksRemaining"], "Only intermission may publish a countdown.");
    if (value.phase === "combat" && value.waveSecondsRemaining === 0)
      issue(context, ["waveSecondsRemaining"], "Combat requires a positive wave countdown.");
    if (value.phase !== "combat" && value.waveSecondsRemaining !== 0)
      issue(context, ["waveSecondsRemaining"], "Only combat may publish a wave countdown.");
    if ((value.phase === "result") !== (value.outcome !== null))
      issue(context, ["outcome"], "Only a terminal result requires an outcome.");
    if ((value.outcome === "defeat") !== (value.defeatReason !== null))
      issue(context, ["defeatReason"], "Only defeat requires a defeat reason.");
  });
export type PublicEncounterView = z.infer<typeof publicEncounterViewSchema>;

const multiplier = finite.positive();
export const pilotRoleModifiersSchema = z
  .object({
    speedMultiplier: multiplier,
    accelerationMultiplier: multiplier,
    maxHpBonus: finite.nonnegative()
  })
  .strict();
export type PilotRoleModifiers = z.infer<typeof pilotRoleModifiersSchema>;
export const gunnerRoleModifiersSchema = z
  .object({
    damageMultiplier: multiplier,
    cooldownMultiplier: multiplier,
    projectileSpeedMultiplier: multiplier
  })
  .strict();
export type GunnerRoleModifiers = z.infer<typeof gunnerRoleModifiersSchema>;
export const shieldRoleModifiersSchema = z
  .object({
    capacityBonus: finite.nonnegative(),
    rechargeMultiplier: multiplier,
    arcWidthBonus: finite.nonnegative()
  })
  .strict();
export type ShieldRoleModifiers = z.infer<typeof shieldRoleModifiersSchema>;
export const publicRoleModifiersViewSchema = z
  .object({
    pilot: pilotRoleModifiersSchema,
    gunner: gunnerRoleModifiersSchema,
    shield: shieldRoleModifiersSchema
  })
  .strict();
export type PublicRoleModifiersView = z.infer<typeof publicRoleModifiersViewSchema>;

function upgradeBelongsToRole(upgradeId: UpgradeId, role: CrewRole): boolean {
  const ids =
    role === "pilot"
      ? PILOT_UPGRADE_IDS
      : role === "gunner"
        ? GUNNER_UPGRADE_IDS
        : SHIELD_UPGRADE_IDS;
  return (ids as readonly string[]).includes(upgradeId);
}

export const publicUpgradeCardSchema = z
  .object({
    upgradeId: upgradeIdSchema,
    role: crewRoleSchema,
    label: z.string().min(1).max(96),
    value: finite,
    price: z.literal(TEAM_UPGRADE_PRICE)
  })
  .strict();
export type PublicUpgradeCard = z.infer<typeof publicUpgradeCardSchema>;
export const publicTeamUpgradeOfferSchema = z
  .object({
    offerId: z.string().min(1).max(64),
    waveNumber: safePositiveInteger,
    cards: z.array(publicUpgradeCardSchema).length(UPGRADE_OFFER_COUNT)
  })
  .strict()
  .superRefine((value, context) => {
    const upgradeIds = new Set<UpgradeId>();
    value.cards.forEach((card, index) => {
      if (card.role !== CREW_ROLES[index])
        issue(context, ["cards", index, "role"], "Cards must use pilot, gunner, shield order.");
      if (!upgradeBelongsToRole(card.upgradeId, card.role))
        issue(context, ["cards", index, "upgradeId"], "Upgrade must belong to its offer role.");
      if (upgradeIds.has(card.upgradeId))
        issue(context, ["cards", index, "upgradeId"], "Offer cards must be distinct.");
      upgradeIds.add(card.upgradeId);
    });
  });
export type PublicTeamUpgradeOffer = z.infer<typeof publicTeamUpgradeOfferSchema>;
export const publicUpgradeVoteSchema = z
  .object({
    upgradeId: upgradeIdSchema,
    role: crewRoleSchema,
    revision: safePositiveInteger
  })
  .strict();
export type PublicUpgradeVote = z.infer<typeof publicUpgradeVoteSchema>;
export const publicUpgradeVotesSchema = z
  .object({
    pilot: publicUpgradeVoteSchema.nullable(),
    gunner: publicUpgradeVoteSchema.nullable(),
    shield: publicUpgradeVoteSchema.nullable()
  })
  .strict();
export type PublicUpgradeVotes = z.infer<typeof publicUpgradeVotesSchema>;
export const publicTeamUpgradeSelectionSchema = z
  .object({
    offerId: z.string().min(1).max(64),
    waveNumber: safePositiveInteger,
    upgradeId: upgradeIdSchema,
    role: crewRoleSchema,
    price: z.literal(TEAM_UPGRADE_PRICE)
  })
  .strict()
  .superRefine((value, context) => {
    if (!upgradeBelongsToRole(value.upgradeId, value.role))
      issue(context, ["upgradeId"], "Upgrade must belong to its selection role.");
  });
export type PublicTeamUpgradeSelection = z.infer<typeof publicTeamUpgradeSelectionSchema>;
export const publicTeamUpgradeViewSchema = z
  .object({
    offer: publicTeamUpgradeOfferSchema.nullable(),
    votes: publicUpgradeVotesSchema,
    selection: publicTeamUpgradeSelectionSchema.nullable()
  })
  .strict();
export type PublicTeamUpgradeView = z.infer<typeof publicTeamUpgradeViewSchema>;

const rectangleObstacle = z
  .object({
    obstacleId: z.string().min(1),
    kind: z.literal("rectangle"),
    x: finite.nonnegative(),
    y: finite.nonnegative(),
    width: finite.positive(),
    height: finite.positive()
  })
  .strict();
const circleObstacle = z
  .object({
    obstacleId: z.string().min(1),
    kind: z.literal("circle"),
    x: finite.nonnegative(),
    y: finite.nonnegative(),
    radius: finite.positive()
  })
  .strict();
export const publicObstacleViewSchema = z.discriminatedUnion("kind", [
  rectangleObstacle,
  circleObstacle
]);
export type PublicObstacleView = z.infer<typeof publicObstacleViewSchema>;

const entityShape = {
  entityId,
  spawnSequence: safePositiveInteger,
  x: finite,
  y: finite,
  velocityX: finite,
  velocityY: finite,
  radius: finite.positive()
} satisfies z.ZodRawShape;
export const publicEnemyViewSchema = z
  .object({
    ...entityShape,
    kind: enemyKindSchema,
    heading: finite,
    hp: finite.positive(),
    maxHp: finite.positive()
  })
  .strict()
  .superRefine((value, context) => {
    if (value.hp > value.maxHp) issue(context, ["hp"], "Enemy HP must not exceed max HP.");
  });
export type PublicEnemyView = z.infer<typeof publicEnemyViewSchema>;
export const publicAsteroidViewSchema = z
  .object({ ...entityShape, hp: finite.positive(), maxHp: finite.positive() })
  .strict()
  .superRefine((value, context) => {
    if (value.hp > value.maxHp) issue(context, ["hp"], "Asteroid HP must not exceed max HP.");
  });
export type PublicAsteroidView = z.infer<typeof publicAsteroidViewSchema>;
export const publicProjectileViewSchema = z
  .object({ ...entityShape, kind: projectileKindSchema, source: projectileSourceSchema.optional() })
  .strict();
export type PublicProjectileView = z.infer<typeof publicProjectileViewSchema>;
export const publicHomingMissileViewSchema = z.object({ ...entityShape, heading: finite }).strict();
export type PublicHomingMissileView = z.infer<typeof publicHomingMissileViewSchema>;

const gameShape = {
  tick: safeNonnegativeInteger,
  elapsedMs: safeNonnegativeInteger,
  worldWidth: finite.positive(),
  worldHeight: finite.positive(),
  arenaRadius: finite.positive(),
  spaceship: publicSpaceshipViewSchema,
  turretAngle: finite,
  shield: publicShieldViewSchema,
  machineGun: publicMachineGunViewSchema,
  encounter: publicEncounterViewSchema,
  roleModifiers: publicRoleModifiersViewSchema,
  credits: safeNonnegativeInteger,
  teamUpgrade: publicTeamUpgradeViewSchema
} satisfies z.ZodRawShape;

interface EntityProjection {
  entityId: string;
  spawnSequence: number;
  x: number;
  y: number;
  radius: number;
}
interface WorldProjection {
  worldWidth: number;
  worldHeight: number;
  arenaRadius: number;
  spaceship: PublicSpaceshipView;
  encounter: PublicEncounterView;
  obstacles?: PublicObstacleView[];
  enemyShips?: PublicEnemyView[];
  asteroids?: PublicAsteroidView[];
  friendlyProjectiles?: PublicProjectileView[];
  hostileProjectiles?: PublicProjectileView[];
  homingMissiles?: PublicHomingMissileView[];
  teamUpgrade: PublicTeamUpgradeView;
}

function issue(context: z.RefinementCtx, path: PropertyKey[], message: string): void {
  context.addIssue({ code: "custom", path, message });
}

function circleFitsArena(
  x: number,
  y: number,
  entityRadius: number,
  worldWidth: number,
  worldHeight: number,
  arenaRadius: number,
  padding = 0
): boolean {
  const legalCenterRadius = arenaRadius + padding - entityRadius;
  if (legalCenterRadius < -CIRCULAR_GEOMETRY_EPSILON) return false;
  const distance = Math.hypot(x - worldWidth / 2, y - worldHeight / 2);
  return distance <= Math.max(0, legalCenterRadius) + CIRCULAR_GEOMETRY_EPSILON;
}

function refineWorld(world: WorldProjection, context: z.RefinementCtx): void {
  const { arenaRadius, spaceship, encounter, worldHeight, worldWidth } = world;
  if (worldWidth !== worldHeight || worldWidth !== arenaRadius * 2)
    issue(
      context,
      ["arenaRadius"],
      "Arena requires a square world with width and height equal to twice its radius."
    );
  if (
    !circleFitsArena(
      spaceship.x,
      spaceship.y,
      spaceship.radius,
      worldWidth,
      worldHeight,
      arenaRadius
    )
  )
    issue(context, ["spaceship"], "Spaceship must remain fully inside the circular arena.");
  if (encounter.defeatReason === "spaceship_destroyed" && spaceship.hp !== 0)
    issue(context, ["spaceship", "hp"], "Destroyed spaceship defeat requires zero HP.");
  if (encounter.defeatReason === "wave_timeout" && spaceship.hp === 0)
    issue(context, ["spaceship", "hp"], "Wave timeout defeat requires positive spaceship HP.");
  if (encounter.outcome !== "defeat" && spaceship.hp === 0)
    issue(context, ["spaceship", "hp"], "Only destroyed-spaceship defeat may publish zero HP.");

  const obstacleIds = new Set<string>();
  world.obstacles?.forEach((obstacle, index) => {
    if (obstacleIds.has(obstacle.obstacleId))
      issue(context, ["obstacles", index, "obstacleId"], "Obstacle IDs must be unique.");
    if (obstacle.x > worldWidth || obstacle.y > worldHeight)
      issue(context, ["obstacles", index], "Obstacle centers must remain in the world.");
    obstacleIds.add(obstacle.obstacleId);
  });

  const collections: [string, EntityProjection[]][] = [
    ["enemyShips", world.enemyShips ?? []],
    ["asteroids", world.asteroids ?? []],
    ["friendlyProjectiles", world.friendlyProjectiles ?? []],
    ["hostileProjectiles", world.hostileProjectiles ?? []],
    ["homingMissiles", world.homingMissiles ?? []]
  ];
  const ids = new Set<string>();
  const sequences = new Set<number>();
  let count = 0;
  for (const [name, entities] of collections) {
    let previous = 0;
    count += entities.length;
    entities.forEach((entity, index) => {
      if (ids.has(entity.entityId))
        issue(context, [name, index, "entityId"], "Entity IDs must be globally unique.");
      if (sequences.has(entity.spawnSequence))
        issue(context, [name, index, "spawnSequence"], "Spawn sequences must be globally unique.");
      if (entity.spawnSequence <= previous)
        issue(context, [name, index, "spawnSequence"], "Collections must use spawn order.");
      const padding = name === "enemyShips" ? 0 : PROJECTILE_WORLD_PADDING;
      if (
        !circleFitsArena(
          entity.x,
          entity.y,
          entity.radius,
          worldWidth,
          worldHeight,
          arenaRadius,
          padding
        )
      )
        issue(
          context,
          [name, index],
          name === "enemyShips"
            ? "Enemy ship must remain fully inside the circular arena."
            : "Transient entity must remain fully inside the padded circular envelope."
        );
      ids.add(entity.entityId);
      sequences.add(entity.spawnSequence);
      previous = entity.spawnSequence;
    });
  }
  if (count > COMBAT_ENTITY_CAPS.dynamicEntities)
    issue(context, [], "Dynamic entity total exceeds cap.");
  if (world.friendlyProjectiles?.some(({ kind }) => kind !== "friendly"))
    issue(context, ["friendlyProjectiles"], "Friendly collection contains a hostile projectile.");
  if (world.hostileProjectiles?.some(({ kind }) => kind !== "hostile"))
    issue(context, ["hostileProjectiles"], "Hostile collection contains a friendly projectile.");

  const { offer, votes, selection } = world.teamUpgrade;
  const hasVotes = CREW_ROLES.some((role) => votes[role] !== null);
  if (encounter.phase !== "intermission" && (offer !== null || hasVotes))
    issue(context, ["teamUpgrade"], "Only intermission may publish an offer and votes.");
  if (encounter.phase === "intermission") {
    if (offer === null) issue(context, ["teamUpgrade", "offer"], "Intermission requires an offer.");
    if (offer !== null && offer.waveNumber !== encounter.waveNumber)
      issue(
        context,
        ["teamUpgrade", "offer", "waveNumber"],
        "Offer and encounter waves must match."
      );
    if (selection !== null)
      issue(
        context,
        ["teamUpgrade", "selection"],
        "An unresolved intermission cannot publish a purchase."
      );
    for (const role of CREW_ROLES) {
      const vote = votes[role];
      if (vote !== null && vote.role !== role)
        issue(context, ["teamUpgrade", "votes", role, "role"], "Vote must match its role slot.");
      if (
        vote !== null &&
        offer !== null &&
        !offer.cards.some((card) => card.upgradeId === vote.upgradeId)
      )
        issue(
          context,
          ["teamUpgrade", "votes", role, "upgradeId"],
          "Vote must reference the current offer."
        );
    }
    if (count !== 0) issue(context, [], "Intermission must not publish dynamic entities.");
  }
}

export const controllerGameSnapshotSchema = z.object(gameShape).strict().superRefine(refineWorld);
export type ControllerGameSnapshot = z.infer<typeof controllerGameSnapshotSchema>;
/** Per-run enemy catalogue: the display draws silhouettes from data, not from code. */
export const publicEnemyCatalogueEntrySchema = z
  .object({
    kind: enemyKindSchema,
    label: z.string().min(1).max(48),
    shape: z.enum(ENEMY_SHAPES),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    outline: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    showHealthBar: z.boolean()
  })
  .strict();
export type PublicEnemyCatalogueEntry = z.infer<typeof publicEnemyCatalogueEntrySchema>;

export const displayGameSnapshotSchema = z
  .object({
    ...gameShape,
    enemyCatalogue: z.array(publicEnemyCatalogueEntrySchema).max(MAX_ENEMY_ARCHETYPES),
    obstacles: z.array(publicObstacleViewSchema),
    enemyShips: z.array(publicEnemyViewSchema).max(COMBAT_ENTITY_CAPS.enemyShips),
    asteroids: z.array(publicAsteroidViewSchema).max(COMBAT_ENTITY_CAPS.asteroids),
    friendlyProjectiles: z
      .array(publicProjectileViewSchema)
      .max(COMBAT_ENTITY_CAPS.friendlyProjectiles),
    hostileProjectiles: z
      .array(publicProjectileViewSchema)
      .max(COMBAT_ENTITY_CAPS.hostileProjectiles),
    homingMissiles: z.array(publicHomingMissileViewSchema).max(COMBAT_ENTITY_CAPS.homingMissiles)
  })
  .strict()
  .superRefine(refineWorld);
export type DisplayGameSnapshot = z.infer<typeof displayGameSnapshotSchema>;

interface RoomProjection {
  phase: RoomPhase;
  runNumber: number;
  players: PublicPlayerView[];
  game: ControllerGameSnapshot | DisplayGameSnapshot | null;
  assignedRole?: CrewRole;
}
function refineRoom(room: RoomProjection, context: z.RefinementCtx): void {
  const playerIds = new Set<string>();
  const roles = new Set<CrewRole>();
  room.players.forEach((player, index) => {
    if (playerIds.has(player.playerId))
      issue(context, ["players", index, "playerId"], "Player IDs must be unique.");
    if (roles.has(player.role))
      issue(context, ["players", index, "role"], "Crew roles must be unique.");
    playerIds.add(player.playerId);
    roles.add(player.role);
  });
  if (room.phase === "lobby") {
    if (room.runNumber !== 0) issue(context, ["runNumber"], "Lobby requires run number zero.");
    if (room.game !== null) issue(context, ["game"], "Lobby requires a null game.");
  } else {
    if (room.runNumber === 0)
      issue(context, ["runNumber"], "An active room requires a positive run number.");
    if (room.game === null) issue(context, ["game"], "An active room requires a game.");
  }
}

const roomShape = {
  roomId: z.string().min(1),
  phase: roomPhaseSchema,
  runNumber: runNumberSchema,
  displayConnected: z.boolean(),
  displayLatencyMs: latencyMsSchema,
  players: z.array(publicPlayerViewSchema).max(PLAYER_CAPACITY)
} satisfies z.ZodRawShape;
export const controllerRoomViewSchema = z
  .object({
    ...roomShape,
    assignedRole: crewRoleSchema,
    game: controllerGameSnapshotSchema.nullable()
  })
  .strict()
  .superRefine(refineRoom);
export type ControllerRoomView = z.infer<typeof controllerRoomViewSchema>;
export const displayRoomViewSchema = z
  .object({ ...roomShape, game: displayGameSnapshotSchema.nullable() })
  .strict()
  .superRefine(refineRoom);
export type DisplayRoomView = z.infer<typeof displayRoomViewSchema>;

export const displayCreateOptionsSchema = z
  .object({ role: z.literal("display"), protocolVersion: z.literal(PROTOCOL_VERSION) })
  .strict();
export type DisplayCreateOptions = z.infer<typeof displayCreateOptionsSchema>;
export const displayJoinOptionsSchema = displayCreateOptionsSchema;
export type DisplayJoinOptions = DisplayCreateOptions;
export const controllerJoinOptionsSchema = z
  .object({
    role: z.literal("controller"),
    protocolVersion: z.literal(PROTOCOL_VERSION),
    playerName: z.string().trim().min(1).max(24)
  })
  .strict();
export type ControllerJoinOptions = z.infer<typeof controllerJoinOptionsSchema>;
export const joinOptionsSchema = z.union([displayCreateOptionsSchema, controllerJoinOptionsSchema]);
export type JoinOptions = z.infer<typeof joinOptionsSchema>;

export const commandEnvelopeSchema = z
  .object({
    protocolVersion: z.literal(PROTOCOL_VERSION),
    roomId: z.string().min(1),
    playerId: z.string().min(1),
    runNumber: runNumberSchema
  })
  .strict();
export type CommandEnvelope = z.infer<typeof commandEnvelopeSchema>;
export const continuousInputEnvelopeSchema = commandEnvelopeSchema
  .extend({ runNumber: activeRunNumberSchema, sequence: safePositiveInteger })
  .strict();
export type ContinuousInputEnvelope = z.infer<typeof continuousInputEnvelopeSchema>;
export const readyCommandSchema = commandEnvelopeSchema;
export type ReadyCommand = CommandEnvelope;
export const pilotInputCommandSchema = continuousInputEnvelopeSchema
  .extend({ vector: vector2Schema, mgFiring: z.boolean() })
  .strict();
export type PilotInputCommand = z.infer<typeof pilotInputCommandSchema>;
export const gunnerInputCommandSchema = continuousInputEnvelopeSchema
  .extend({ aim: vector2Schema, firing: z.boolean() })
  .strict();
export type GunnerInputCommand = z.infer<typeof gunnerInputCommandSchema>;
export const shieldInputCommandSchema = continuousInputEnvelopeSchema
  .extend({ aim: vector2Schema, active: z.boolean() })
  .strict();
export type ShieldInputCommand = z.infer<typeof shieldInputCommandSchema>;
export const upgradeVoteCommandSchema = commandEnvelopeSchema
  .extend({
    runNumber: activeRunNumberSchema,
    actionId: z.uuid(),
    waveNumber: safePositiveInteger,
    offerId: z.string().min(1).max(64),
    upgradeId: upgradeIdSchema,
    revision: safePositiveInteger
  })
  .strict();
export type UpgradeVoteCommand = z.infer<typeof upgradeVoteCommandSchema>;

export const serverLatencyProbeSchema = z
  .object({ protocolVersion: z.literal(PROTOCOL_VERSION), probeId: z.string().min(1) })
  .strict();
export type ServerLatencyProbe = z.infer<typeof serverLatencyProbeSchema>;
export const clientLatencyPongSchema = z
  .object({
    protocolVersion: z.literal(PROTOCOL_VERSION),
    roomId: z.string().min(1),
    probeId: z.string().min(1)
  })
  .strict();
export type ClientLatencyPong = z.infer<typeof clientLatencyPongSchema>;
export const roomClosingReasonSchema = z.enum(ROOM_CLOSING_REASONS);
export type RoomClosingReason = z.infer<typeof roomClosingReasonSchema>;
export const roomClosingSchema = z.object({ reason: roomClosingReasonSchema }).strict();
export type RoomClosing = z.infer<typeof roomClosingSchema>;

export const clientMessage = {
  ready: "controller:ready",
  pilotInput: "pilot:input",
  gunnerInput: "gunner:input",
  shieldInput: "shield:input",
  upgradeVote: "upgrade:vote",
  latencyPong: "client:latency-pong"
} as const;
export const serverMessage = {
  error: "server:error",
  latencyProbe: "server:latency-probe",
  roomClosing: "room:closing"
} as const;
export const serverErrorCodeSchema = z.enum([
  "invalid_message",
  "protocol_mismatch",
  "room_full",
  "room_not_found",
  "not_controller",
  "invalid_phase",
  "reconnect_expired",
  "identity_mismatch",
  "role_mismatch",
  "action_conflict",
  "action_not_available",
  "stale_action",
  "stale_run"
]);
export type ServerErrorCode = z.infer<typeof serverErrorCodeSchema>;
export const serverErrorSchema = z
  .object({ code: serverErrorCodeSchema, message: z.string().min(1) })
  .strict();
export type ServerError = z.infer<typeof serverErrorSchema>;

export * from "./balance.ts";
