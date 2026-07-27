export const RECONNECTION_SESSION_KEY = "town-defenders.controller-session.v1";

export interface ReconnectionSession {
  endpoint: string;
  roomId: string;
  playerName: string;
  token: string;
}

export interface SessionStorage {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

export function saveReconnectionSession(
  storage: SessionStorage,
  session: ReconnectionSession
): void {
  storage.setItem(RECONNECTION_SESSION_KEY, JSON.stringify(session));
}

export function readReconnectionSession(storage: SessionStorage): ReconnectionSession | undefined {
  const serialized = storage.getItem(RECONNECTION_SESSION_KEY);
  if (serialized === null) {
    return undefined;
  }

  try {
    const value: unknown = JSON.parse(serialized);
    return isReconnectionSession(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

export function clearReconnectionSession(storage: SessionStorage): void {
  storage.removeItem(RECONNECTION_SESSION_KEY);
}

function isReconnectionSession(value: unknown): value is ReconnectionSession {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const session = value as Record<string, unknown>;
  return (
    typeof session.endpoint === "string" &&
    session.endpoint.length > 0 &&
    typeof session.roomId === "string" &&
    session.roomId.length > 0 &&
    typeof session.playerName === "string" &&
    session.playerName.length > 0 &&
    typeof session.token === "string" &&
    session.token.length > 0
  );
}
