import { useEffect, useState } from "react";
import type { PublicShipCatalogue } from "@spaceship-defender/protocol";

import { fetchServerStatus, UNKNOWN_SERVER, type ServerStatus } from "../serverStatus.js";
import { fetchShipCatalogue } from "../shipCatalogue.js";

/**
 * The hulls a room can be opened on. Fetched once, and only informative: a
 * display that cannot reach the route still creates rooms, on the preset's own
 * default hull.
 */
/**
 * `enabled` is false on a page that hosts its own run: it has a preset of its
 * own, and asking a server for hulls it will not play would make "plays with no
 * server" mean "plays as long as the server answers".
 */
export function useShipCatalogue(
  gameServerUrl: string,
  enabled = true
): PublicShipCatalogue | undefined {
  const [catalogue, setCatalogue] = useState<PublicShipCatalogue | undefined>(undefined);

  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    void fetchShipCatalogue(gameServerUrl, controller.signal).then((next) => {
      if (!controller.signal.aborted) setCatalogue(next);
    });
    return () => {
      controller.abort();
    };
  }, [gameServerUrl, enabled]);

  return catalogue;
}

/**
 * Asked repeatedly, unlike the hull catalogue: a window can be announced, the
 * network can drop or a release can land while a crew is still deciding on the
 * create screen, and the screen has to follow. Asked again at once when the
 * device gains or loses its network, rather than up to fifteen seconds later.
 * Only while no room is open - inside one the room's own state carries it.
 */
export function useServerStatus(gameServerUrl: string, paused: boolean): ServerStatus {
  const [status, setStatus] = useState<ServerStatus>(UNKNOWN_SERVER);

  useEffect(() => {
    if (paused) return undefined;
    const controller = new AbortController();
    const poll = (): void => {
      void fetchServerStatus(gameServerUrl, controller.signal).then((next) => {
        if (!controller.signal.aborted) setStatus(next);
      });
    };
    poll();
    const timer = setInterval(poll, 15_000);
    globalThis.addEventListener("online", poll);
    globalThis.addEventListener("offline", poll);
    return () => {
      controller.abort();
      clearInterval(timer);
      globalThis.removeEventListener("online", poll);
      globalThis.removeEventListener("offline", poll);
    };
  }, [gameServerUrl, paused]);

  return status;
}
