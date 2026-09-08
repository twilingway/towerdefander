import { healthResponseSchema, type MaintenanceState } from "@spaceship-defender/protocol";

import { toHttpOrigin } from "./shipCatalogue.js";

/**
 * What the server says about itself before a room exists.
 *
 * A display sitting on the create screen has no room state, so the announced
 * maintenance window would otherwise reach it only as a refusal when someone
 * presses create -- which is the worst possible moment to learn about it. This
 * is the same public route the release waits on, asked for the same reason.
 *
 * A failure is not fatal and returns nothing: an announcement that cannot be
 * fetched must not stop a crew from playing.
 */
export async function fetchMaintenance(
  gameServerUrl: string,
  signal: AbortSignal
): Promise<MaintenanceState | undefined> {
  try {
    const response = await fetch(`${toHttpOrigin(gameServerUrl)}/health`, { signal });
    if (!response.ok) return undefined;
    const parsed = healthResponseSchema.safeParse(await response.json());
    return parsed.success ? parsed.data.maintenance : undefined;
  } catch {
    return undefined;
  }
}
