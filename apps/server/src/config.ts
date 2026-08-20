export interface ServerConfig {
  host: string;
  port: number;
  reconnectionGraceSeconds: number;
  gracefullyShutdown: boolean;
}

export function readServerConfig(environment: NodeJS.ProcessEnv = process.env): ServerConfig {
  const configuredHost = environment.HOST?.trim();
  const configuredPort = environment.PORT?.trim();
  const configuredGraceSeconds = environment.RECONNECTION_GRACE_SECONDS?.trim();
  const gracefullyShutdown = environment.GRACEFUL_SHUTDOWN !== "false";
  const host =
    configuredHost === undefined || configuredHost.length === 0 ? "0.0.0.0" : configuredHost;
  const rawPort =
    configuredPort === undefined || configuredPort.length === 0 ? "2567" : configuredPort;
  const port = Number(rawPort);
  const reconnectionGraceSeconds = Number(configuredGraceSeconds ?? "30");

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

  return { host, port, reconnectionGraceSeconds, gracefullyShutdown };
}
