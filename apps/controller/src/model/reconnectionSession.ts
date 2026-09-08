export const RECONNECTION_SESSION_KEY = "spaceship-defender.controller-session.v2";
export const LEGACY_V10_RECONNECTION_SESSION_KEY = "spaceship-defender.controller-session.v1";
export const LEGACY_RECONNECTION_SESSION_KEY = "town-defenders.controller-session.v1";

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

export interface ConsentedLeaveRoom {
  readonly reconnection: { enabled: boolean };
  leave(consented?: boolean): Promise<unknown>;
}

export function saveReconnectionSession(
  storage: SessionStorage,
  session: ReconnectionSession
): void {
  storage.removeItem(LEGACY_V10_RECONNECTION_SESSION_KEY);
  storage.removeItem(LEGACY_RECONNECTION_SESSION_KEY);
  storage.setItem(RECONNECTION_SESSION_KEY, JSON.stringify(session));
}

export function readReconnectionSession(storage: SessionStorage): ReconnectionSession | undefined {
  storage.removeItem(LEGACY_V10_RECONNECTION_SESSION_KEY);
  storage.removeItem(LEGACY_RECONNECTION_SESSION_KEY);
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
  storage.removeItem(LEGACY_V10_RECONNECTION_SESSION_KEY);
  storage.removeItem(LEGACY_RECONNECTION_SESSION_KEY);
}

export async function leaveControllerRoom(
  room: ConsentedLeaveRoom,
  storage: SessionStorage | undefined
): Promise<void> {
  room.reconnection.enabled = false;
  if (storage !== undefined) clearReconnectionSession(storage);
  await room.leave(true);
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
