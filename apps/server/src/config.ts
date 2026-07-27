export interface ServerConfig {
  host: string;
  port: number;
  reconnectionGraceSeconds: number;
  simulationIntervalMs: number;
  gracefullyShutdown: boolean;
}

export function readServerConfig(environment: NodeJS.ProcessEnv = process.env): ServerConfig {
  const configuredHost = environment.HOST?.trim();
  const configuredPort = environment.PORT?.trim();
  const configuredGraceSeconds = environment.RECONNECTION_GRACE_SECONDS?.trim();
  const configuredSimulationIntervalMs = environment.SIMULATION_INTERVAL_MS?.trim();
  const gracefullyShutdown = environment.GRACEFUL_SHUTDOWN !== "false";
  const host =
    configuredHost === undefined || configuredHost.length === 0 ? "0.0.0.0" : configuredHost;
  const rawPort =
    configuredPort === undefined || configuredPort.length === 0 ? "2567" : configuredPort;
  const port = Number(rawPort);
  const reconnectionGraceSeconds = Number(configuredGraceSeconds ?? "30");
  const simulationIntervalMs = Number(configuredSimulationIntervalMs ?? "1000");

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
    !Number.isSafeInteger(simulationIntervalMs) ||
    simulationIntervalMs < 10 ||
    simulationIntervalMs > 10_000
  ) {
    throw new Error("SIMULATION_INTERVAL_MS must be an integer between 10 and 10000.");
  }

  return { host, port, reconnectionGraceSeconds, simulationIntervalMs, gracefullyShutdown };
}
