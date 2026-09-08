import { useEffect, useState } from "react";
import type { MaintenanceState, PublicShipCatalogue } from "@spaceship-defender/protocol";

import { fetchMaintenance } from "../serverStatus.js";
import { fetchShipCatalogue } from "../shipCatalogue.js";

/**
 * The hulls a room can be opened on. Fetched once, and only informative: a
 * display that cannot reach the route still creates rooms, on the preset's own
 * default hull.
 */
export function useShipCatalogue(gameServerUrl: string): PublicShipCatalogue | undefined {
  const [catalogue, setCatalogue] = useState<PublicShipCatalogue | undefined>(undefined);

  useEffect(() => {
    const controller = new AbortController();
    void fetchShipCatalogue(gameServerUrl, controller.signal).then((next) => {
      if (!controller.signal.aborted) setCatalogue(next);
    });
    return () => {
      controller.abort();
    };
  }, [gameServerUrl]);

  return catalogue;
}

/**
 * Asked repeatedly, unlike the hull catalogue: a window can be announced while
 * a crew is still deciding on the create screen, and the countdown has to move
 * once it has. Only while no room is open - inside one the room's own state
 * carries it.
 */
export function useMaintenance(
  gameServerUrl: string,
  paused: boolean
): MaintenanceState | undefined {
  const [maintenance, setMaintenance] = useState<MaintenanceState | undefined>(undefined);

  useEffect(() => {
    if (paused) return undefined;
    const controller = new AbortController();
    const poll = (): void => {
      void fetchMaintenance(gameServerUrl, controller.signal).then((state) => {
        if (!controller.signal.aborted) setMaintenance(state);
      });
    };
    poll();
    const timer = setInterval(poll, 15_000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [gameServerUrl, paused]);

  return maintenance;
}
