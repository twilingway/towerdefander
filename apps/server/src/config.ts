export interface ServerConfig {
  host: string;
  port: number;
  reconnectionGraceSeconds: number;
  lobbyTtlSeconds: number;
  resultTtlSeconds: number;
  zeroControllerTtlSeconds: number;
  absoluteTtlSeconds: number;
  statsPassword: string | undefined;
  gracefullyShutdown: boolean;
}

const MAX_PHASE_TTL_SECONDS = 86_400;
const MAX_ABSOLUTE_TTL_SECONDS = 604_800;
const MAX_STATS_PASSWORD_BYTES = 256;

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
  const gracefullyShutdown = environment.GRACEFUL_SHUTDOWN !== "false";
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
  const absoluteTtlSeconds = readIntegerSeconds(
    environment,
    "ROOM_ABSOLUTE_TTL_SECONDS",
    4 * 60 * 60,
    MAX_ABSOLUTE_TTL_SECONDS
  );
  const statsPassword =
    rawStatsPassword === undefined || rawStatsPassword.length === 0 ? undefined : rawStatsPassword;

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

  return {
    host,
    port,
    reconnectionGraceSeconds,
    lobbyTtlSeconds,
    resultTtlSeconds,
    zeroControllerTtlSeconds,
    absoluteTtlSeconds,
    statsPassword,
    gracefullyShutdown
  };
}
