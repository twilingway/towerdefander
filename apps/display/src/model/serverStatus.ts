import {
  healthResponseSchema,
  PROTOCOL_VERSION,
  type MaintenanceState
} from "@spaceship-defender/protocol";

import { toHttpOrigin } from "./shipCatalogue.js";

/**
 * Whether the network modes can be played from here, as far as the page can
 * tell before a room exists.
 *
 * - `unknown`: not asked yet - nothing is switched off on a guess.
 * - `offline`: the device itself has no network.
 * - `unreachable`: it has one, but the game server does not answer.
 * - `outdated`: the server answers on another protocol; its rooms would refuse
 *   this build, so the player is asked to update instead.
 * - `online`: nothing in the way.
 */
export type ServerReach = "unknown" | "offline" | "unreachable" | "outdated" | "online";

export interface ServerStatus {
  readonly reach: ServerReach;
  /** The announced maintenance window, when the server told us about one. */
  readonly maintenance: MaintenanceState | undefined;
}

export const UNKNOWN_SERVER: ServerStatus = { reach: "unknown", maintenance: undefined };

/**
 * What the server says about itself before a room exists.
 *
 * A display sitting on the create screen has no room state, so an announced
 * maintenance window, a server gone quiet or a server on a newer protocol would
 * otherwise reach it only as a refusal when someone presses create - the worst
 * moment to learn any of them. This is the same public route the release waits
 * on, asked for the same reason.
 *
 * The version is read before the strict schema: a newer server that adds a
 * field to its answer is a server this build is too old for, not one that is
 * down.
 */
export async function fetchServerStatus(
  gameServerUrl: string,
  signal: AbortSignal,
  online: boolean = globalThis.navigator.onLine
): Promise<ServerStatus> {
  if (!online) return { reach: "offline", maintenance: undefined };
  try {
    const response = await fetch(`${toHttpOrigin(gameServerUrl)}/health`, { signal });
    if (!response.ok) return { reach: "unreachable", maintenance: undefined };
    const body: unknown = await response.json();
    const version = (body as { protocolVersion?: unknown } | null)?.protocolVersion;
    if (typeof version === "number" && version !== PROTOCOL_VERSION) {
      return { reach: "outdated", maintenance: undefined };
    }
    const parsed = healthResponseSchema.safeParse(body);
    return parsed.success
      ? { reach: "online", maintenance: parsed.data.maintenance }
      : { reach: "unreachable", maintenance: undefined };
  } catch {
    return { reach: "unreachable", maintenance: undefined };
  }
}

/**
 * Why the network modes are switched off, or `undefined` when they are not.
 * An announced window outranks the rest: it has its own countdown to show.
 */
export type NetworkClosure = "maintenance" | "offline" | "unreachable" | "outdated";

export function networkClosure(
  maintenance: MaintenanceState | undefined,
  reach: ServerReach
): NetworkClosure | undefined {
  if (maintenance?.active === true) return "maintenance";
  if (reach === "offline" || reach === "unreachable" || reach === "outdated") return reach;
  return undefined;
}
