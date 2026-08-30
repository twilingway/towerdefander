import { fileURLToPath } from "node:url";

export interface ServerConfig {
  host: string;
  port: number;
  reconnectionGraceSeconds: number;
  lobbyTtlSeconds: number;
  resultTtlSeconds: number;
  zeroControllerTtlSeconds: number;
  waveTtlSeconds: number;
  absoluteTtlSeconds: number;
  maxConcurrentRooms: number;
  statsPassword: string | undefined;
  balancePassword: string | undefined;
  balancePresetPath: string;
  gracefullyShutdown: boolean;
  /**
   * Whether a display may ask a room to open on a late wave. A testing aid,
   * off unless the operator turns it on, so a public server cannot be told to
   * drop a crew onto a boss.
   */
  allowStartWave: boolean;
}

const MAX_PHASE_TTL_SECONDS = 86_400;
const MAX_ABSOLUTE_TTL_SECONDS = 604_800;
const MAX_STATS_PASSWORD_BYTES = 256;
const MAX_CONCURRENT_ROOMS_LIMIT = 10_000;
/**
 * Rooms one process will host at once. Measured ceiling on the reference
 * machine is about 40 rooms on late waves before the tick falls behind, and a
 * process that accepts the next room past its ceiling degrades every room it
 * already hosts, so the default leaves headroom.
 */
const DEFAULT_MAX_CONCURRENT_ROOMS = 30;
// Resolved against this package, not the working directory: `pnpm dev` starts
// the server from apps/server while the visible demo starts it from the repo
// root, and both must read the same presets.
const DEFAULT_BALANCE_PRESET_PATH = fileURLToPath(new URL("../data/balance.json", import.meta.url));

function readPositiveInteger(
  environment: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  maximum: number
): number {
  const configuredValue = environment[name]?.trim();
  const rawValue =
    configuredValue === undefined || configuredValue.length === 0
      ? String(fallback)
      : configuredValue;
  const value = Number(rawValue);

  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${name} must be an integer between 1 and ${String(maximum)}.`);
  }

  return value;
}

function readIntegerSeconds(
  environment: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  maximum: number
): number {
  const configuredValue = environment[name]?.trim();
  const rawValue =
    configuredValue === undefined || configuredValue.length === 0
      ? String(fallback)
      : configuredValue;
  const value = Number(rawValue);

  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${name} must be an integer between 1 and ${String(maximum)} seconds.`);
  }

  return value;
}

export function readServerConfig(environment: NodeJS.ProcessEnv = process.env): ServerConfig {
  const configuredHost = environment.HOST?.trim();
  const configuredPort = environment.PORT?.trim();
  const configuredGraceSeconds = environment.RECONNECTION_GRACE_SECONDS?.trim();
  const rawStatsPassword = environment.ROOM_STATS_PASSWORD;
  const rawBalancePassword = environment.ADMIN_BALANCE_PASSWORD;
  const configuredBalancePath = environment.BALANCE_PRESET_PATH?.trim();
  const gracefullyShutdown = environment.GRACEFUL_SHUTDOWN !== "false";
  const allowStartWave = environment.ALLOW_START_WAVE === "true";
  const host =
    configuredHost === undefined || configuredHost.length === 0 ? "0.0.0.0" : configuredHost;
  const rawPort =
    configuredPort === undefined || configuredPort.length === 0 ? "2567" : configuredPort;
  const port = Number(rawPort);
  const reconnectionGraceSeconds = Number(configuredGraceSeconds ?? "30");
  const lobbyTtlSeconds = readIntegerSeconds(
    environment,
    "ROOM_LOBBY_TTL_SECONDS",
    15 * 60,
    MAX_PHASE_TTL_SECONDS
  );
  const resultTtlSeconds = readIntegerSeconds(
    environment,
    "ROOM_RESULT_TTL_SECONDS",
    10 * 60,
    MAX_PHASE_TTL_SECONDS
  );
  const zeroControllerTtlSeconds = readIntegerSeconds(
    environment,
    "ROOM_ZERO_CONTROLLER_TTL_SECONDS",
    5 * 60,
    MAX_PHASE_TTL_SECONDS
  );
  const waveTtlSeconds = readIntegerSeconds(
    environment,
    "ROOM_WAVE_TTL_SECONDS",
    20 * 60,
    MAX_PHASE_TTL_SECONDS
  );
  const absoluteTtlSeconds = readIntegerSeconds(
    environment,
    "ROOM_ABSOLUTE_TTL_SECONDS",
    12 * 60 * 60,
    MAX_ABSOLUTE_TTL_SECONDS
  );
  const maxConcurrentRooms = readPositiveInteger(
    environment,
    "ROOM_MAX_CONCURRENT",
    DEFAULT_MAX_CONCURRENT_ROOMS,
    MAX_CONCURRENT_ROOMS_LIMIT
  );
  const statsPassword =
    rawStatsPassword === undefined || rawStatsPassword.length === 0 ? undefined : rawStatsPassword;
  const balancePassword =
    rawBalancePassword === undefined || rawBalancePassword.length === 0
      ? undefined
      : rawBalancePassword;
  const balancePresetPath =
    configuredBalancePath === undefined || configuredBalancePath.length === 0
      ? DEFAULT_BALANCE_PRESET_PATH
      : configuredBalancePath;

  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`PORT must be an integer between 1 and 65535; received "${rawPort}".`);
  }

  if (
    !Number.isFinite(reconnectionGraceSeconds) ||
    reconnectionGraceSeconds <= 0 ||
    reconnectionGraceSeconds > 300
  ) {
    throw new Error("RECONNECTION_GRACE_SECONDS must be greater than 0 and at most 300.");
  }

  if (
    statsPassword !== undefined &&
    Buffer.byteLength(statsPassword, "utf8") > MAX_STATS_PASSWORD_BYTES
  ) {
    throw new Error(
      `ROOM_STATS_PASSWORD must be at most ${String(MAX_STATS_PASSWORD_BYTES)} UTF-8 bytes.`
    );
  }

  if (
    balancePassword !== undefined &&
    Buffer.byteLength(balancePassword, "utf8") > MAX_STATS_PASSWORD_BYTES
  ) {
    throw new Error(
      `ADMIN_BALANCE_PASSWORD must be at most ${String(MAX_STATS_PASSWORD_BYTES)} UTF-8 bytes.`
    );
  }

  return {
    host,
    port,
    reconnectionGraceSeconds,
    lobbyTtlSeconds,
    resultTtlSeconds,
    zeroControllerTtlSeconds,
    waveTtlSeconds,
    absoluteTtlSeconds,
    maxConcurrentRooms,
    statsPassword,
    balancePassword,
    balancePresetPath,
    gracefullyShutdown,
    allowStartWave
  };
}
