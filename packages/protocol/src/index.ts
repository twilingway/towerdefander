import { z } from "zod";

export const PROTOCOL_VERSION = 1 as const;

export const clientRoleSchema = z.enum(["display", "controller"]);
export type ClientRole = z.infer<typeof clientRoleSchema>;

export const roomPhaseSchema = z.enum(["lobby", "active", "finished"]);
export type RoomPhase = z.infer<typeof roomPhaseSchema>;

export const publicPlayerViewSchema = z
  .object({
    playerId: z.string().min(1),
    playerName: z.string().min(1).max(24),
    ready: z.boolean(),
    connected: z.boolean(),
    signalCount: z.number().int().nonnegative()
  })
  .strict();
export type PublicPlayerView = z.infer<typeof publicPlayerViewSchema>;

export const publicRoomViewSchema = z
  .object({
    roomId: z.string().min(1),
    phase: roomPhaseSchema,
    displayConnected: z.boolean(),
    players: z.array(publicPlayerViewSchema).max(2)
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

export const signalCommandSchema = z
  .object({
    protocolVersion: z.literal(PROTOCOL_VERSION),
    actionId: z.uuid()
  })
  .strict();
export type SignalCommand = z.infer<typeof signalCommandSchema>;

export const clientMessage = {
  ready: "player:ready",
  signal: "player:signal"
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
  "reconnect_expired"
]);
export type ServerErrorCode = z.infer<typeof serverErrorCodeSchema>;

export const serverErrorSchema = z
  .object({
    code: serverErrorCodeSchema,
    message: z.string()
  })
  .strict();
export type ServerError = z.infer<typeof serverErrorSchema>;
