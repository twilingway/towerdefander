import { z } from "zod";

export const PROTOCOL_VERSION = 10 as const;
export const ROOM_TYPE = "spaceship_defender" as const;
export const PLAYER_CAPACITY = 3 as const;
export const CREW_ROLES = ["pilot", "gunner", "shield"] as const;
export const ENCOUNTER_PHASES = ["combat", "intermission", "result"] as const;
export const TERMINAL_OUTCOMES = ["defeat", "victory"] as const;
export const ENEMY_KINDS = ["gunship", "missileCarrier"] as const;
export const PROJECTILE_KINDS = ["friendly", "hostile"] as const;
export const UPGRADE_STATUSES = ["available", "selected"] as const;
export const ROOM_CLOSING_REASONS = [
  "display_left",
  "display_reconnect_expired",
  "lobby_expired",
  "result_expired",
  "controllers_expired",
  "room_lifetime_expired"
] as const;
export const PROJECTILE_WORLD_PADDING = 256 as const;
export const INTERMISSION_DURATION_TICKS = 200 as const;
export const UPGRADE_OFFER_COUNT = 3 as const;
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
export const enemyKindSchema = z.enum(ENEMY_KINDS);
export type EnemyKind = z.infer<typeof enemyKindSchema>;
export const projectileKindSchema = z.enum(PROJECTILE_KINDS);
export type ProjectileKind = z.infer<typeof projectileKindSchema>;
export const upgradeIdSchema = z.enum(UPGRADE_IDS);
export type UpgradeId = z.infer<typeof upgradeIdSchema>;
export const upgradeSelectionSourceSchema = z.enum(["player", "fallback"]);
export type UpgradeSelectionSource = z.infer<typeof upgradeSelectionSourceSchema>;
export const upgradeStatusSchema = z.enum(UPGRADE_STATUSES);
export type UpgradeStatus = z.infer<typeof upgradeStatusSchema>;

// Zod numbers reject NaN and infinities by default.
const finite = z.number();
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
    maxHp: finite.positive()
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

export const publicEncounterViewSchema = z
  .object({
    phase: encounterPhaseSchema,
    outcome: terminalOutcomeSchema.nullable(),
    waveNumber: safePositiveInteger,
    encounterTick: safeNonnegativeInteger,
    phaseTicksRemaining: z.number().int().min(0).max(INTERMISSION_DURATION_TICKS),
    score: safeNonnegativeInteger
  })
  .strict()
  .superRefine((value, context) => {
    if (value.phase === "intermission" && value.phaseTicksRemaining === 0)
      issue(context, ["phaseTicksRemaining"], "Intermission requires a positive countdown.");
    if (value.phase !== "intermission" && value.phaseTicksRemaining !== 0)
      issue(context, ["phaseTicksRemaining"], "Only intermission may publish a countdown.");
    if ((value.phase === "result") !== (value.outcome !== null))
      issue(context, ["outcome"], "Only a terminal result requires an outcome.");
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
    label: z.string().min(1).max(96),
    value: finite
  })
  .strict();
export type PublicUpgradeCard = z.infer<typeof publicUpgradeCardSchema>;
export const publicUpgradeOfferSchema = z
  .object({
    offerId: z.string().min(1).max(64),
    role: crewRoleSchema,
    waveNumber: safePositiveInteger,
    cards: z.array(publicUpgradeCardSchema).length(UPGRADE_OFFER_COUNT)
  })
  .strict()
  .superRefine((value, context) => {
    const upgradeIds = new Set<UpgradeId>();
    value.cards.forEach((card, index) => {
      if (!upgradeBelongsToRole(card.upgradeId, value.role))
        issue(context, ["cards", index, "upgradeId"], "Upgrade must belong to its offer role.");
      if (upgradeIds.has(card.upgradeId))
        issue(context, ["cards", index, "upgradeId"], "Offer cards must be distinct.");
      upgradeIds.add(card.upgradeId);
    });
  });
export type PublicUpgradeOffer = z.infer<typeof publicUpgradeOfferSchema>;
export const publicUpgradeSelectionSchema = z
  .object({
    offerId: z.string().min(1).max(64),
    upgradeId: upgradeIdSchema,
    role: crewRoleSchema,
    source: upgradeSelectionSourceSchema
  })
  .strict()
  .superRefine((value, context) => {
    if (!upgradeBelongsToRole(value.upgradeId, value.role))
      issue(context, ["upgradeId"], "Upgrade must belong to its selection role.");
  });
export type PublicUpgradeSelection = z.infer<typeof publicUpgradeSelectionSchema>;
export const publicControllerUpgradeViewSchema = z
  .object({
    status: upgradeStatusSchema,
    offer: publicUpgradeOfferSchema,
    selection: publicUpgradeSelectionSchema.nullable()
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.status === "selected") !== (value.selection !== null))
      issue(context, ["status"], "Upgrade status must match selection presence.");
    if (value.selection !== null) {
      if (value.selection.role !== value.offer.role)
        issue(context, ["selection", "role"], "Selection belongs to another role.");
      const matches =
        value.selection.offerId === value.offer.offerId &&
        value.offer.cards.some((card) => card.upgradeId === value.selection?.upgradeId);
      if (!matches) issue(context, ["selection"], "Selection must reference a published offer.");
    }
  });
export type PublicControllerUpgradeView = z.infer<typeof publicControllerUpgradeViewSchema>;

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
  .object({ ...entityShape, kind: projectileKindSchema })
  .strict();
export type PublicProjectileView = z.infer<typeof publicProjectileViewSchema>;
export const publicHomingMissileViewSchema = z.object({ ...entityShape, heading: finite }).strict();
export type PublicHomingMissileView = z.infer<typeof publicHomingMissileViewSchema>;

const gameShape = {
  tick: safeNonnegativeInteger,
  elapsedMs: safeNonnegativeInteger,
  worldWidth: finite.positive(),
  worldHeight: finite.positive(),
  spaceship: publicSpaceshipViewSchema,
  turretAngle: finite,
  shield: publicShieldViewSchema,
  encounter: publicEncounterViewSchema,
  roleModifiers: publicRoleModifiersViewSchema
} satisfies z.ZodRawShape;

interface EntityProjection {
  entityId: string;
  spawnSequence: number;
  x: number;
  y: number;
}
interface WorldProjection {
  worldWidth: number;
  worldHeight: number;
  spaceship: PublicSpaceshipView;
  encounter: PublicEncounterView;
  obstacles?: PublicObstacleView[];
  enemyShips?: PublicEnemyView[];
  asteroids?: PublicAsteroidView[];
  friendlyProjectiles?: PublicProjectileView[];
  hostileProjectiles?: PublicProjectileView[];
  homingMissiles?: PublicHomingMissileView[];
  upgrade?: PublicControllerUpgradeView | null;
}

function issue(context: z.RefinementCtx, path: PropertyKey[], message: string): void {
  context.addIssue({ code: "custom", path, message });
}

function refineWorld(world: WorldProjection, context: z.RefinementCtx): void {
  const { spaceship, encounter, worldHeight, worldWidth } = world;
  if (
    spaceship.radius * 2 > worldWidth ||
    spaceship.x < spaceship.radius ||
    spaceship.x > worldWidth - spaceship.radius
  )
    issue(context, ["spaceship", "x"], "Spaceship must remain inside horizontal world bounds.");
  if (
    spaceship.radius * 2 > worldHeight ||
    spaceship.y < spaceship.radius ||
    spaceship.y > worldHeight - spaceship.radius
  )
    issue(context, ["spaceship", "y"], "Spaceship must remain inside vertical world bounds.");
  if (encounter.outcome === "defeat" && spaceship.hp !== 0)
    issue(context, ["spaceship", "hp"], "Defeat requires zero spaceship HP.");
  if (encounter.outcome !== "defeat" && spaceship.hp === 0)
    issue(context, ["spaceship", "hp"], "Only defeat may publish zero spaceship HP.");

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
      if (
        entity.x < -PROJECTILE_WORLD_PADDING ||
        entity.x > worldWidth + PROJECTILE_WORLD_PADDING ||
        entity.y < -PROJECTILE_WORLD_PADDING ||
        entity.y > worldHeight + PROJECTILE_WORLD_PADDING
      )
        issue(context, [name, index], "Entity must remain inside padded world bounds.");
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

  if (encounter.phase === "combat" && world.upgrade != null)
    issue(context, ["upgrade"], "Combat must not publish upgrade offers.");
  if (encounter.phase === "intermission") {
    if (world.upgrade === null)
      issue(context, ["upgrade"], "Controller intermission requires a personalized offer.");
    if (world.upgrade !== undefined && world.upgrade?.offer.waveNumber !== encounter.waveNumber)
      issue(context, ["upgrade", "offer", "waveNumber"], "Offer and encounter waves must match.");
    if (count !== 0) issue(context, [], "Intermission must not publish dynamic entities.");
  }
  if (encounter.phase === "result" && world.upgrade != null)
    issue(context, ["upgrade"], "A terminal result must not publish upgrade offers.");
}

export const controllerGameSnapshotSchema = z
  .object({ ...gameShape, upgrade: publicControllerUpgradeViewSchema.nullable() })
  .strict()
  .superRefine(refineWorld);
export type ControllerGameSnapshot = z.infer<typeof controllerGameSnapshotSchema>;
export const displayGameSnapshotSchema = z
  .object({
    ...gameShape,
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
  if (
    room.assignedRole !== undefined &&
    room.game !== null &&
    "upgrade" in room.game &&
    room.game.upgrade !== null &&
    room.game.upgrade.offer.role !== room.assignedRole
  )
    issue(context, ["game", "upgrade", "offer", "role"], "Upgrade must match assigned role.");
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
  .extend({ vector: vector2Schema })
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
export const upgradeChooseCommandSchema = commandEnvelopeSchema
  .extend({
    runNumber: activeRunNumberSchema,
    actionId: z.uuid(),
    waveNumber: safePositiveInteger,
    offerId: z.string().min(1).max(64),
    upgradeId: upgradeIdSchema
  })
  .strict();
export type UpgradeChooseCommand = z.infer<typeof upgradeChooseCommandSchema>;

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
  upgradeChoose: "upgrade:choose",
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
  "already_chosen",
  "action_not_available",
  "stale_run"
]);
export type ServerErrorCode = z.infer<typeof serverErrorCodeSchema>;
export const serverErrorSchema = z
  .object({ code: serverErrorCodeSchema, message: z.string().min(1) })
  .strict();
export type ServerError = z.infer<typeof serverErrorSchema>;
