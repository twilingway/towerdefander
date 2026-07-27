import { z } from "zod";

export const PROTOCOL_VERSION = 3 as const;

export const clientRoleSchema = z.enum(["display", "controller"]);
export type ClientRole = z.infer<typeof clientRoleSchema>;

export const roomPhaseSchema = z.enum(["lobby", "active", "finished"]);
export type RoomPhase = z.infer<typeof roomPhaseSchema>;

export const sectorIdSchema = z.union([z.literal(0), z.literal(1)]);
export type SectorId = z.infer<typeof sectorIdSchema>;

export const defenseResultSchema = z.enum(["in_progress", "victory", "defeat"]);
export type DefenseResult = z.infer<typeof defenseResultSchema>;

export const defenseStageSchema = z.enum(["intermission", "combat"]);
export type DefenseStage = z.infer<typeof defenseStageSchema>;

export const enemyTypeSchema = z.enum(["balanced", "fast", "heavy", "boss"]);
export type EnemyType = z.infer<typeof enemyTypeSchema>;

export const publicSectorViewSchema = z
  .object({
    sectorId: sectorIdSchema,
    assignedPlayerId: z.string().min(1).nullable(),
    gateHealth: z.number().int().nonnegative(),
    gateMaxHealth: z.number().int().positive(),
    defenseLevel: z.number().int().positive(),
    defenseDamage: z.number().int().positive(),
    nextUpgradeCost: z.number().int().positive().nullable(),
    enemyCount: z.number().int().nonnegative(),
    airstrikeTargetAvailable: z.boolean()
  })
  .strict();
export type PublicSectorView = z.infer<typeof publicSectorViewSchema>;

export const publicEnemyViewSchema = z
  .object({
    enemyId: z.string().min(1),
    sectorId: sectorIdSchema,
    enemyType: enemyTypeSchema,
    health: z.number().int().positive(),
    maxHealth: z.number().int().positive(),
    progress: z.number().int().nonnegative()
  })
  .strict();
export type PublicEnemyView = z.infer<typeof publicEnemyViewSchema>;

export const publicAirstrikeEffectSchema = z
  .object({
    sequence: z.number().int().positive(),
    actionId: z.uuid(),
    playerId: z.string().min(1),
    targetSectorId: sectorIdSchema,
    appliedTick: z.number().int().nonnegative()
  })
  .strict();
export type PublicAirstrikeEffect = z.infer<typeof publicAirstrikeEffectSchema>;

export const publicGameSnapshotSchema = z
  .object({
    tick: z.number().int().nonnegative(),
    elapsedMs: z.number().int().nonnegative(),
    treasury: z.number().int().nonnegative(),
    pathLength: z.number().int().positive(),
    repairCost: z.number().int().positive(),
    result: defenseResultSchema,
    waveNumber: z.number().int().min(1).max(5),
    totalWaves: z.literal(5),
    stage: defenseStageSchema,
    intermissionRemainingSeconds: z.number().int().nonnegative(),
    airstrikeCharge: z.number().int().min(0).max(100),
    airstrikeChargeRequired: z.literal(100),
    airstrikeDamage: z.number().int().positive(),
    lastAirstrikeEffect: publicAirstrikeEffectSchema.nullable(),
    sectors: z.array(publicSectorViewSchema).length(2),
    enemies: z.array(publicEnemyViewSchema)
  })
  .strict();
export type PublicGameSnapshot = z.infer<typeof publicGameSnapshotSchema>;

export const publicPlayerViewSchema = z
  .object({
    playerId: z.string().min(1),
    playerName: z.string().min(1).max(24),
    ready: z.boolean(),
    connected: z.boolean(),
    sectorId: sectorIdSchema.nullable().default(null)
  })
  .strict();
export type PublicPlayerView = z.infer<typeof publicPlayerViewSchema>;

export const publicRoomViewSchema = z
  .object({
    roomId: z.string().min(1),
    phase: roomPhaseSchema,
    displayConnected: z.boolean(),
    players: z.array(publicPlayerViewSchema).max(2),
    game: publicGameSnapshotSchema.nullable().default(null)
  })
  .strict();
export type PublicRoomView = z.infer<typeof publicRoomViewSchema>;

export const joinOptionsSchema = z.discriminatedUnion("role", [
  z
    .object({
      role: z.literal("display"),
      protocolVersion: z.literal(PROTOCOL_VERSION)
    })
    .strict(),
  z
    .object({
      role: z.literal("controller"),
      protocolVersion: z.literal(PROTOCOL_VERSION),
      playerName: z.string().trim().min(1).max(24)
    })
    .strict()
]);
export type JoinOptions = z.infer<typeof joinOptionsSchema>;

export const readyCommandSchema = z
  .object({
    protocolVersion: z.literal(PROTOCOL_VERSION),
    ready: z.boolean()
  })
  .strict();
export type ReadyCommand = z.infer<typeof readyCommandSchema>;

export const resourceActionCommandSchema = z
  .object({
    protocolVersion: z.literal(PROTOCOL_VERSION),
    roomId: z.string().min(1),
    playerId: z.string().min(1),
    actionId: z.uuid()
  })
  .strict();
export type ResourceActionCommand = z.infer<typeof resourceActionCommandSchema>;

export const airstrikeCommandSchema = resourceActionCommandSchema
  .extend({
    targetSectorId: sectorIdSchema
  })
  .strict();
export type AirstrikeCommand = z.infer<typeof airstrikeCommandSchema>;

export const clientMessage = {
  ready: "player:ready",
  repair: "player:repair",
  upgrade: "player:upgrade",
  airstrike: "player:airstrike"
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
  "insufficient_funds",
  "action_not_available"
]);
export type ServerErrorCode = z.infer<typeof serverErrorCodeSchema>;

export const serverErrorSchema = z
  .object({
    code: serverErrorCodeSchema,
    message: z.string()
  })
  .strict();
export type ServerError = z.infer<typeof serverErrorSchema>;
