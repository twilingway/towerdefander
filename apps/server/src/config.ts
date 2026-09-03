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
  /**
   * Secret for the maintenance-window route. Deliberately not the balance
   * password: that one goes to whoever tunes numbers, and this one ends other
   * people's runs.
   */
  deployControlToken: string | undefined;
  balancePresetPath: string;
  /** Where finished balance-batch reports are kept. */
  statsBatchDirectory: string;
  /** How many reports survive rotation; older ones are deleted after a write. */
  statsBatchKeep: number;
  /** Wall-clock ceiling on one batch, after which the child is stopped. */
  statsBatchTimeoutSeconds: number;
  /** The batch harness and the guard that ties its lifetime to this process. */
  statsHarnessPath: string;
  statsProcessGuardUrl: string;
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
// Same reasoning as the preset path: resolved against this package so the
// console and the CLI look in one place whatever the working directory is.
const DEFAULT_STATS_BATCH_DIRECTORY = fileURLToPath(
  new URL("../data/stats-batches", import.meta.url)
);
/**
 * Resolved from this module rather than from wherever the caller sits: `src`
 * and the bundled `dist` are the same depth inside the package, so one relative
 * URL is right in development and in a build. A module one directory deeper
 * would resolve differently once tsup collapses it into `dist/index.js`.
 */
const STATS_HARNESS_PATH = fileURLToPath(
  new URL("../scripts/run-balance-batch.mjs", import.meta.url)
);
const STATS_PROCESS_GUARD_URL = new URL("../../../scripts/owned-process-guard.mjs", import.meta.url)
  .href;
const DEFAULT_STATS_BATCH_KEEP = 50;
const MAX_STATS_BATCH_KEEP = 500;
/**
 * A batch is CPU-bound and shares the machine with live rooms, so a mistyped
 * matrix must not be able to hold a core for an hour.
 */
const DEFAULT_STATS_BATCH_TIMEOUT_SECONDS = 30 * 60;
const MAX_STATS_BATCH_TIMEOUT_SECONDS = 6 * 60 * 60;

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
  const rawDeployControlToken = environment.DEPLOY_CONTROL_TOKEN;
  const configuredBalancePath = environment.BALANCE_PRESET_PATH?.trim();
  const configuredBatchDirectory = environment.STATS_BATCH_DIR?.trim();
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
  // A wave that cannot be cleared is a lost run, not a longer one. Twenty
  // minutes was set when a wave dumped its ships in the first thirty seconds
  // and was over inside a minute; a wave is a two-minute schedule now, so the
  // deadline has to be close enough to it to mean something.
  const waveTtlSeconds = readIntegerSeconds(
    environment,
    "ROOM_WAVE_TTL_SECONDS",
    5 * 60,
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
  const deployControlToken =
    rawDeployControlToken === undefined || rawDeployControlToken.length === 0
      ? undefined
      : rawDeployControlToken;
  const balancePresetPath =
    configuredBalancePath === undefined || configuredBalancePath.length === 0
      ? DEFAULT_BALANCE_PRESET_PATH
      : configuredBalancePath;
  const statsBatchDirectory =
    configuredBatchDirectory === undefined || configuredBatchDirectory.length === 0
      ? DEFAULT_STATS_BATCH_DIRECTORY
      : configuredBatchDirectory;
  const statsBatchKeep = readPositiveInteger(
    environment,
    "STATS_BATCH_KEEP",
    DEFAULT_STATS_BATCH_KEEP,
    MAX_STATS_BATCH_KEEP
  );
  const statsBatchTimeoutSeconds = readIntegerSeconds(
    environment,
    "STATS_BATCH_TIMEOUT_SECONDS",
    DEFAULT_STATS_BATCH_TIMEOUT_SECONDS,
    MAX_STATS_BATCH_TIMEOUT_SECONDS
  );

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

  if (
    deployControlToken !== undefined &&
    Buffer.byteLength(deployControlToken, "utf8") > MAX_STATS_PASSWORD_BYTES
  ) {
    throw new Error(
      `DEPLOY_CONTROL_TOKEN must be at most ${String(MAX_STATS_PASSWORD_BYTES)} UTF-8 bytes.`
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
    deployControlToken,
    balancePresetPath,
    statsBatchDirectory,
    statsBatchKeep,
    statsBatchTimeoutSeconds,
    statsHarnessPath: STATS_HARNESS_PATH,
    statsProcessGuardUrl: STATS_PROCESS_GUARD_URL,
    gracefullyShutdown,
    allowStartWave
  };
}
