import { z } from "zod";

export const PROTOCOL_VERSION = 4 as const;
export const MIN_PLAYER_CAPACITY = 2 as const;
export const MAX_PLAYER_CAPACITY = 6 as const;

export const playerCapacitySchema = z.union([
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6)
]);
export type PlayerCapacity = z.infer<typeof playerCapacitySchema>;

export const clientRoleSchema = z.enum(["display", "controller"]);
export type ClientRole = z.infer<typeof clientRoleSchema>;

export const roomPhaseSchema = z.enum(["lobby", "active", "finished"]);
export type RoomPhase = z.infer<typeof roomPhaseSchema>;

export const sectorIdSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5)
]);
export type SectorId = z.infer<typeof sectorIdSchema>;

export const defenseResultSchema = z.enum(["in_progress", "victory", "defeat"]);
export type DefenseResult = z.infer<typeof defenseResultSchema>;

export const defenseStageSchema = z.enum(["intermission", "combat"]);
export type DefenseStage = z.infer<typeof defenseStageSchema>;

export const enemyTypeSchema = z.enum(["balanced", "fast", "heavy", "boss"]);
export type EnemyType = z.infer<typeof enemyTypeSchema>;

export function getAirstrikeTargetSectorIds(
  sectorId: SectorId,
  playerCapacity: PlayerCapacity
): SectorId[] {
  if (sectorId >= playerCapacity) {
    throw new RangeError(
      `Sector ${String(sectorId)} is outside player capacity ${String(playerCapacity)}.`
    );
  }

  const candidates = [
    sectorId,
    (sectorId - 1 + playerCapacity) % playerCapacity,
    (sectorId + 1) % playerCapacity
  ] as SectorId[];

  return candidates.filter((candidate, index) => candidates.indexOf(candidate) === index);
}

export const airstrikeTargetSectorIdsSchema = z
  .array(sectorIdSchema)
  .min(2)
  .max(3)
  .superRefine((sectorIds, context) => {
    if (new Set(sectorIds).size !== sectorIds.length) {
      context.addIssue({
        code: "custom",
        message: "Airstrike target sector IDs must be unique."
      });
    }
  });

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
  .strict()
  .superRefine((sector, context) => {
    if (sector.airstrikeTargetAvailable !== sector.enemyCount > 0) {
      context.addIssue({
        code: "custom",
        path: ["airstrikeTargetAvailable"],
        message: "Airstrike target availability must equal whether enemies are present."
      });
    }
  });
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

export const publicPlayerViewSchema = z
  .object({
    playerId: z.string().min(1),
    playerName: z.string().min(1).max(24),
    ready: z.boolean(),
    connected: z.boolean(),
    sectorId: sectorIdSchema,
    airstrikeTargetSectorIds: airstrikeTargetSectorIdsSchema
  })
  .strict();
export type PublicPlayerView = z.infer<typeof publicPlayerViewSchema>;

const gameSnapshotBaseShape = {
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
  sectors: z.array(publicSectorViewSchema).min(MIN_PLAYER_CAPACITY).max(MAX_PLAYER_CAPACITY)
} satisfies z.ZodRawShape;

export const controllerGameSnapshotSchema = z.object(gameSnapshotBaseShape).strict();
export type ControllerGameSnapshot = z.infer<typeof controllerGameSnapshotSchema>;

export const displayGameSnapshotSchema = z
  .object({
    ...gameSnapshotBaseShape,
    lastAirstrikeEffect: publicAirstrikeEffectSchema.nullable(),
    enemies: z.array(publicEnemyViewSchema)
  })
  .strict();
export type DisplayGameSnapshot = z.infer<typeof displayGameSnapshotSchema>;

interface RoomViewForRefinement {
  phase: RoomPhase;
  playerCapacity: PlayerCapacity;
  players: PublicPlayerView[];
  game: ControllerGameSnapshot | DisplayGameSnapshot | null;
}

function addRoomViewIssues(room: RoomViewForRefinement, context: z.RefinementCtx): void {
  const { game, phase, playerCapacity, players } = room;

  if (players.length > playerCapacity) {
    context.addIssue({
      code: "custom",
      path: ["players"],
      message: "Player count cannot exceed player capacity."
    });
  }

  const playerIds = new Set<string>();
  const playerSectorIds = new Set<SectorId>();

  players.forEach((player, index) => {
    if (playerIds.has(player.playerId)) {
      context.addIssue({
        code: "custom",
        path: ["players", index, "playerId"],
        message: "Player IDs must be unique."
      });
    }
    playerIds.add(player.playerId);

    if (player.sectorId >= playerCapacity) {
      context.addIssue({
        code: "custom",
        path: ["players", index, "sectorId"],
        message: "Player sector must exist in this room."
      });
      return;
    }

    if (playerSectorIds.has(player.sectorId)) {
      context.addIssue({
        code: "custom",
        path: ["players", index, "sectorId"],
        message: "Player sectors must be unique."
      });
    }
    playerSectorIds.add(player.sectorId);

    const expectedTargets = getAirstrikeTargetSectorIds(player.sectorId, playerCapacity);
    if (
      player.airstrikeTargetSectorIds.length !== expectedTargets.length ||
      player.airstrikeTargetSectorIds.some(
        (target, targetIndex) => target !== expectedTargets[targetIndex]
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["players", index, "airstrikeTargetSectorIds"],
        message: "Airstrike target sector IDs must be ordered as self, left, right."
      });
    }
  });

  if (phase === "lobby" && game !== null) {
    context.addIssue({
      code: "custom",
      path: ["game"],
      message: "Lobby room views must not contain a game snapshot."
    });
  }
  if ((phase === "active" || phase === "finished") && game === null) {
    context.addIssue({
      code: "custom",
      path: ["game"],
      message: "Active and finished room views must contain a game snapshot."
    });
  }
  if (game === null) {
    return;
  }

  if (game.sectors.length !== playerCapacity) {
    context.addIssue({
      code: "custom",
      path: ["game", "sectors"],
      message: "Sector count must equal player capacity."
    });
  }

  const playerBySector = new Map(players.map((player) => [player.sectorId, player] as const));

  game.sectors.forEach((sector, index) => {
    if (sector.sectorId !== index) {
      context.addIssue({
        code: "custom",
        path: ["game", "sectors", index, "sectorId"],
        message: "Sectors must be ordered and contiguous from zero."
      });
    }
    if (sector.sectorId >= playerCapacity) {
      context.addIssue({
        code: "custom",
        path: ["game", "sectors", index, "sectorId"],
        message: "Sector must exist in this room."
      });
      return;
    }

    const expectedOwner = playerBySector.get(sector.sectorId)?.playerId ?? null;
    if (sector.assignedPlayerId !== expectedOwner) {
      context.addIssue({
        code: "custom",
        path: ["game", "sectors", index, "assignedPlayerId"],
        message: "Assigned player must match the roster owner of this sector."
      });
    }
  });

  if ("enemies" in game) {
    game.enemies.forEach((enemy, index) => {
      if (enemy.sectorId >= playerCapacity) {
        context.addIssue({
          code: "custom",
          path: ["game", "enemies", index, "sectorId"],
          message: "Enemy sector must exist in this room."
        });
      }
    });
    if (
      game.lastAirstrikeEffect !== null &&
      game.lastAirstrikeEffect.targetSectorId >= playerCapacity
    ) {
      context.addIssue({
        code: "custom",
        path: ["game", "lastAirstrikeEffect", "targetSectorId"],
        message: "Airstrike effect target sector must exist in this room."
      });
    }
  }
}

const roomViewBaseShape = {
  roomId: z.string().min(1),
  phase: roomPhaseSchema,
  displayConnected: z.boolean(),
  playerCapacity: playerCapacitySchema,
  players: z.array(publicPlayerViewSchema).max(MAX_PLAYER_CAPACITY)
} satisfies z.ZodRawShape;

export const controllerRoomViewSchema = z
  .object({
    ...roomViewBaseShape,
    game: controllerGameSnapshotSchema.nullable().default(null)
  })
  .strict()
  .superRefine(addRoomViewIssues);
export type ControllerRoomView = z.infer<typeof controllerRoomViewSchema>;

export const displayRoomViewSchema = z
  .object({
    ...roomViewBaseShape,
    game: displayGameSnapshotSchema.nullable().default(null)
  })
  .strict()
  .superRefine(addRoomViewIssues);
export type DisplayRoomView = z.infer<typeof displayRoomViewSchema>;

export const publicGameSnapshotSchema = displayGameSnapshotSchema;
export type PublicGameSnapshot = DisplayGameSnapshot;

export const publicRoomViewSchema = displayRoomViewSchema;
export type PublicRoomView = DisplayRoomView;

export const displayCreateOptionsSchema = z
  .object({
    role: z.literal("display"),
    protocolVersion: z.literal(PROTOCOL_VERSION),
    playerCapacity: playerCapacitySchema
  })
  .strict();
export type DisplayCreateOptions = z.infer<typeof displayCreateOptionsSchema>;

export const displayJoinOptionsSchema = z
  .object({
    role: z.literal("display"),
    protocolVersion: z.literal(PROTOCOL_VERSION)
  })
  .strict();
export type DisplayJoinOptions = z.infer<typeof displayJoinOptionsSchema>;

export const controllerJoinOptionsSchema = z
  .object({
    role: z.literal("controller"),
    protocolVersion: z.literal(PROTOCOL_VERSION),
    playerName: z.string().trim().min(1).max(24)
  })
  .strict();
export type ControllerJoinOptions = z.infer<typeof controllerJoinOptionsSchema>;

export const joinOptionsSchema = z.union([
  displayCreateOptionsSchema,
  displayJoinOptionsSchema,
  controllerJoinOptionsSchema
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
