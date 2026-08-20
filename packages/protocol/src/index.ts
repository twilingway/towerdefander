import { z } from "zod";

export const PROTOCOL_VERSION = 5 as const;
export const PLAYER_CAPACITY = 3 as const;
export const CREW_ROLES = ["pilot", "gunner", "shield"] as const;
export const PROJECTILE_WORLD_PADDING = 256 as const;

export const clientRoleSchema = z.enum(["display", "controller"]);
export type ClientRole = z.infer<typeof clientRoleSchema>;

export const crewRoleSchema = z.enum(CREW_ROLES);
export type CrewRole = z.infer<typeof crewRoleSchema>;

export const roomPhaseSchema = z.enum(["lobby", "active"]);
export type RoomPhase = z.infer<typeof roomPhaseSchema>;

// Zod numbers reject NaN and infinities by default.
const finiteNumberSchema = z.number();
const worldSizeSchema = finiteNumberSchema.positive();
const worldCoordinateSchema = finiteNumberSchema.nonnegative();

export const vector2Schema = z
  .object({
    x: finiteNumberSchema.min(-1).max(1),
    y: finiteNumberSchema.min(-1).max(1)
  })
  .strict();
export type Vector2 = z.infer<typeof vector2Schema>;

export const publicPlayerViewSchema = z
  .object({
    playerId: z.string().min(1),
    playerName: z.string().min(1).max(24),
    role: crewRoleSchema,
    ready: z.boolean(),
    connected: z.boolean()
  })
  .strict();
export type PublicPlayerView = z.infer<typeof publicPlayerViewSchema>;

export const publicCastleViewSchema = z
  .object({
    x: worldCoordinateSchema,
    y: worldCoordinateSchema,
    velocityX: finiteNumberSchema,
    velocityY: finiteNumberSchema,
    radius: finiteNumberSchema.positive()
  })
  .strict();
export type PublicCastleView = z.infer<typeof publicCastleViewSchema>;

export const publicShieldViewSchema = z
  .object({
    angle: finiteNumberSchema,
    active: z.boolean()
  })
  .strict();
export type PublicShieldView = z.infer<typeof publicShieldViewSchema>;

const publicRectangleObstacleViewSchema = z
  .object({
    obstacleId: z.string().min(1),
    kind: z.literal("rectangle"),
    x: worldCoordinateSchema,
    y: worldCoordinateSchema,
    width: finiteNumberSchema.positive(),
    height: finiteNumberSchema.positive()
  })
  .strict();

const publicCircleObstacleViewSchema = z
  .object({
    obstacleId: z.string().min(1),
    kind: z.literal("circle"),
    x: worldCoordinateSchema,
    y: worldCoordinateSchema,
    radius: finiteNumberSchema.positive()
  })
  .strict();

export const publicObstacleViewSchema = z.discriminatedUnion("kind", [
  publicRectangleObstacleViewSchema,
  publicCircleObstacleViewSchema
]);
export type PublicObstacleView = z.infer<typeof publicObstacleViewSchema>;

export const publicProjectileViewSchema = z
  .object({
    projectileId: z.string().min(1),
    x: finiteNumberSchema,
    y: finiteNumberSchema,
    velocityX: finiteNumberSchema,
    velocityY: finiteNumberSchema,
    radius: finiteNumberSchema.positive()
  })
  .strict();
export type PublicProjectileView = z.infer<typeof publicProjectileViewSchema>;

const gameSnapshotBaseShape = {
  tick: z.number().int().nonnegative(),
  elapsedMs: z.number().int().nonnegative(),
  worldWidth: worldSizeSchema,
  worldHeight: worldSizeSchema,
  castle: publicCastleViewSchema,
  turretAngle: finiteNumberSchema,
  shield: publicShieldViewSchema
} satisfies z.ZodRawShape;

interface WorldForRefinement {
  worldWidth: number;
  worldHeight: number;
  castle: PublicCastleView;
  obstacles?: PublicObstacleView[];
  projectiles?: PublicProjectileView[];
}

function addWorldIssues(world: WorldForRefinement, context: z.RefinementCtx): void {
  const { castle, worldHeight, worldWidth } = world;

  if (
    castle.radius * 2 > worldWidth ||
    castle.x < castle.radius ||
    castle.x > worldWidth - castle.radius
  ) {
    context.addIssue({
      code: "custom",
      path: ["castle", "x"],
      message: "Castle and its radius must remain inside the horizontal world bounds."
    });
  }

  if (
    castle.radius * 2 > worldHeight ||
    castle.y < castle.radius ||
    castle.y > worldHeight - castle.radius
  ) {
    context.addIssue({
      code: "custom",
      path: ["castle", "y"],
      message: "Castle and its radius must remain inside the vertical world bounds."
    });
  }

  const obstacleIds = new Set<string>();
  world.obstacles?.forEach((obstacle, index) => {
    if (obstacleIds.has(obstacle.obstacleId)) {
      context.addIssue({
        code: "custom",
        path: ["obstacles", index, "obstacleId"],
        message: "Obstacle IDs must be unique."
      });
    }
    obstacleIds.add(obstacle.obstacleId);

    if (obstacle.x > worldWidth || obstacle.y > worldHeight) {
      context.addIssue({
        code: "custom",
        path: ["obstacles", index],
        message: "Obstacle centers must remain inside the world bounds."
      });
    }
  });

  const projectileIds = new Set<string>();
  world.projectiles?.forEach((projectile, index) => {
    if (projectileIds.has(projectile.projectileId)) {
      context.addIssue({
        code: "custom",
        path: ["projectiles", index, "projectileId"],
        message: "Projectile IDs must be unique."
      });
    }
    projectileIds.add(projectile.projectileId);

    if (
      projectile.x < -PROJECTILE_WORLD_PADDING ||
      projectile.x > worldWidth + PROJECTILE_WORLD_PADDING ||
      projectile.y < -PROJECTILE_WORLD_PADDING ||
      projectile.y > worldHeight + PROJECTILE_WORLD_PADDING
    ) {
      context.addIssue({
        code: "custom",
        path: ["projectiles", index],
        message: "Projectile positions must remain inside the padded world bounds."
      });
    }
  });
}

export const controllerGameSnapshotSchema = z
  .object(gameSnapshotBaseShape)
  .strict()
  .superRefine(addWorldIssues);
export type ControllerGameSnapshot = z.infer<typeof controllerGameSnapshotSchema>;

export const displayGameSnapshotSchema = z
  .object({
    ...gameSnapshotBaseShape,
    obstacles: z.array(publicObstacleViewSchema),
    projectiles: z.array(publicProjectileViewSchema)
  })
  .strict()
  .superRefine(addWorldIssues);
export type DisplayGameSnapshot = z.infer<typeof displayGameSnapshotSchema>;

interface RoomForRefinement {
  phase: RoomPhase;
  players: PublicPlayerView[];
  game: ControllerGameSnapshot | DisplayGameSnapshot | null;
}

function addRoomIssues(room: RoomForRefinement, context: z.RefinementCtx): void {
  const playerIds = new Set<string>();
  const roles = new Set<CrewRole>();

  room.players.forEach((player, index) => {
    if (playerIds.has(player.playerId)) {
      context.addIssue({
        code: "custom",
        path: ["players", index, "playerId"],
        message: "Player IDs must be unique."
      });
    }
    playerIds.add(player.playerId);

    if (roles.has(player.role)) {
      context.addIssue({
        code: "custom",
        path: ["players", index, "role"],
        message: "Crew roles must be unique."
      });
    }
    roles.add(player.role);
  });

  if (room.phase === "lobby" && room.game !== null) {
    context.addIssue({
      code: "custom",
      path: ["game"],
      message: "Lobby room views must not contain a game snapshot."
    });
  }

  if (room.phase === "active" && room.game === null) {
    context.addIssue({
      code: "custom",
      path: ["game"],
      message: "Active room views must contain a game snapshot."
    });
  }
}

const roomViewBaseShape = {
  roomId: z.string().min(1),
  phase: roomPhaseSchema,
  displayConnected: z.boolean(),
  players: z.array(publicPlayerViewSchema).max(PLAYER_CAPACITY)
} satisfies z.ZodRawShape;

export const controllerRoomViewSchema = z
  .object({
    ...roomViewBaseShape,
    game: controllerGameSnapshotSchema.nullable()
  })
  .strict()
  .superRefine(addRoomIssues);
export type ControllerRoomView = z.infer<typeof controllerRoomViewSchema>;

export const displayRoomViewSchema = z
  .object({
    ...roomViewBaseShape,
    game: displayGameSnapshotSchema.nullable()
  })
  .strict()
  .superRefine(addRoomIssues);
export type DisplayRoomView = z.infer<typeof displayRoomViewSchema>;

export const displayCreateOptionsSchema = z
  .object({
    role: z.literal("display"),
    protocolVersion: z.literal(PROTOCOL_VERSION)
  })
  .strict();
export type DisplayCreateOptions = z.infer<typeof displayCreateOptionsSchema>;

// Create and reconnect use the same strict display handshake in protocol v5.
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
    playerId: z.string().min(1)
  })
  .strict();
export type CommandEnvelope = z.infer<typeof commandEnvelopeSchema>;

export const continuousInputEnvelopeSchema = commandEnvelopeSchema
  .extend({
    sequence: z.number().int().positive()
  })
  .strict();
export type ContinuousInputEnvelope = z.infer<typeof continuousInputEnvelopeSchema>;

export const readyCommandSchema = commandEnvelopeSchema;
export type ReadyCommand = CommandEnvelope;

export const pilotInputCommandSchema = continuousInputEnvelopeSchema
  .extend({
    vector: vector2Schema
  })
  .strict();
export type PilotInputCommand = z.infer<typeof pilotInputCommandSchema>;

export const gunnerInputCommandSchema = continuousInputEnvelopeSchema
  .extend({
    aim: vector2Schema,
    firing: z.boolean()
  })
  .strict();
export type GunnerInputCommand = z.infer<typeof gunnerInputCommandSchema>;

export const shieldInputCommandSchema = continuousInputEnvelopeSchema
  .extend({
    aim: vector2Schema,
    active: z.boolean()
  })
  .strict();
export type ShieldInputCommand = z.infer<typeof shieldInputCommandSchema>;

export const clientMessage = {
  ready: "controller:ready",
  pilotInput: "pilot:input",
  gunnerInput: "gunner:input",
  shieldInput: "shield:input"
} as const;

export const serverMessage = {
  error: "server:error"
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
  "role_mismatch"
]);
export type ServerErrorCode = z.infer<typeof serverErrorCodeSchema>;

export const serverErrorSchema = z
  .object({
    code: serverErrorCodeSchema,
    message: z.string().min(1)
  })
  .strict();
export type ServerError = z.infer<typeof serverErrorSchema>;
