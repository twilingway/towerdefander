import { Client, type Room } from "@colyseus/sdk";
import {
  PROTOCOL_VERSION,
  ROOM_TYPE,
  clientMessage,
  roomClosingSchema,
  serverErrorSchema,
  serverLatencyProbeSchema,
  serverMessage,
  type CrewSize,
  type DisplayRoomView,
  type PublicPlayerView,
  type UpgradeId
} from "@spaceship-defender/protocol";
import { useEffect, useRef, useState } from "react";

import {
  closeDisplayRoom,
  confirmDisplayRoomClose,
  roomClosingMessage
} from "../displayRoomLifecycle.js";
import { toDisplayRoomView, type NetworkRoomState } from "../roomView.js";
import { createActionId, nextVoteRevision } from "@spaceship-defender/client-shared";
import { buildVisibleDemoWorld, publishVisibleDemoWorld } from "../visibleDemo.js";
import { GAME_SERVER_URL } from "../environment.js";
import { recordSnapshotWork } from "../instruments.js";
import { readLiveView, setLiveView } from "../liveView.js";
import { createFailureMessage } from "../roomFailure.js";
import { publishWorld } from "../worldStore.js";
import { useViewPublisher } from "./useViewPublisher.js";

type DisplayRoom = Room<unknown, NetworkRoomState>;

export type ConnectionStatus = "idle" | "connecting" | "connected" | "reconnecting" | "error";

export interface RoomSession {
  /** The throttled view React is allowed to see. */
  readonly view: DisplayRoomView | undefined;
  readonly status: ConnectionStatus;
  readonly error: string;
  readonly closingRoom: boolean;
  readonly connectionEpoch: number;
  /** Set when this page is also the pilot; undefined for an ordinary display. */
  readonly cockpitPlayer: string | undefined;
  readonly cockpitSeat: PublicPlayerView | undefined;
  readonly room: DisplayRoom | undefined;
  readonly sessionId: string;
  /** Resolves to the new room id, or undefined when the create was refused. */
  readonly createRoom: (
    crewSize: CrewSize,
    shipArchetypeId: string | undefined,
    startWave: number,
    cockpitPlayerName?: string
  ) => Promise<string | undefined>;
  readonly closeRoom: () => Promise<void>;
  readonly sendCockpitReady: () => void;
  readonly sendCockpitVote: (upgradeId: UpgradeId) => void;
  /** The socket the byte counter hooks, read fresh on every reconnect. */
  readonly readSocket: () => unknown;
}

/**
 * The whole network life of the shared screen: the room it creates, the eight
 * callbacks it answers, the patches it turns into views, and the two commands a
 * solo cockpit sends.
 *
 * It knows nothing about the address. Creating a room reports the id and the
 * caller moves the URL - which is also why this hook has to be called above the
 * routes: unmounting it leaves the room, and a navigation that unmounted it
 * would close the socket it had just opened.
 */
export function useRoomSession(visibleDemo: boolean): RoomSession {
  const roomReference = useRef<DisplayRoom | undefined>(undefined);
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  /** What was last handed to `setStatus`; see the guard in `applyRoomState`. */
  const statusReference = useRef<ConnectionStatus>("idle");
  const [networkView, setNetworkView] = useState<DisplayRoomView>();
  /** Patches the display's own contract refused, counted rather than fatal. */
  const refusedPatchesReference = useRef(0);
  const [error, setError] = useState("");
  const [connectionEpoch, setConnectionEpoch] = useState(0);
  const [cockpitPlayer, setCockpitPlayer] = useState<string | undefined>(undefined);
  /** Highest revision this screen has sent; the server refuses a repeat. */
  const cockpitVoteRevision = useRef(0);
  /** Read inside room callbacks, which close over the first render. */
  const cockpitPlayerReference = useRef<string | undefined>(undefined);
  const [closingRoom, setClosingRoom] = useState(false);
  const publisher = useViewPublisher(setNetworkView, readLiveView);

  /** A refusal is about the command, not the run: a new phase clears it. */
  const encounterPhase = networkView?.game?.encounter.phase;
  useEffect(() => {
    setError("");
  }, [encounterPhase]);

  useEffect(
    () => () => {
      const room = roomReference.current;
      roomReference.current = undefined;
      if (room !== undefined) {
        room.reconnection.enabled = false;
        void room.leave(false);
      }
    },
    []
  );

  /** The seat this page holds when it is also the pilot. */
  const cockpitSeat =
    cockpitPlayer === undefined
      ? undefined
      : networkView?.players.find((player) => player.playerId === roomReference.current?.sessionId);

  /**
   * The cockpit's vote. Optimism and revisions are the controller's problem to
   * repeat: the room deduplicates on `actionId` and keeps the accepted revision
   * per role, so a retry is safe and a stale number is refused rather than
   * double-charged.
   */
  function sendCockpitVote(upgradeId: UpgradeId): void {
    const room = roomReference.current;
    const offer = networkView?.game?.teamUpgrade.offer;
    if (
      room === undefined ||
      networkView === undefined ||
      cockpitSeat === undefined ||
      offer == null
    ) {
      return;
    }
    const accepted = networkView.game?.teamUpgrade.votes[cockpitSeat.role]?.revision ?? 0;
    const revision = nextVoteRevision(accepted, cockpitVoteRevision.current);
    cockpitVoteRevision.current = revision;
    room.send(clientMessage.upgradeVote, {
      protocolVersion: PROTOCOL_VERSION,
      roomId: networkView.roomId,
      playerId: cockpitSeat.playerId,
      runNumber: networkView.runNumber,
      actionId: createActionId(),
      waveNumber: offer.waveNumber,
      offerId: offer.offerId,
      upgradeId,
      revision
    });
  }

  function sendCockpitReady(): void {
    const room = roomReference.current;
    if (room === undefined || networkView === undefined || cockpitSeat === undefined) return;
    room.send(clientMessage.ready, {
      protocolVersion: PROTOCOL_VERSION,
      roomId: networkView.roomId,
      playerId: cockpitSeat.playerId,
      runNumber: networkView.runNumber
    });
    // Fullscreen is not asked for here: the card already carries the button,
    // and this screen's helper toggles rather than requests, so a player who
    // went fullscreen first would be thrown back out by pressing Готов.
  }

  async function createRoom(
    crewSize: CrewSize,
    shipArchetypeId: string | undefined,
    startWave: number,
    cockpitPlayerName?: string
  ): Promise<string | undefined> {
    statusReference.current = "connecting";
    setStatus("connecting");
    setError("");
    setClosingRoom(false);
    setCockpitPlayer(cockpitPlayerName);
    cockpitPlayerReference.current = cockpitPlayerName;
    try {
      const room = await new Client(GAME_SERVER_URL).create<NetworkRoomState>(ROOM_TYPE, {
        // One connection with both duties when this device is also the pilot.
        // The two shapes differ in what they name, so the seat count only
        // travels with the display form.
        ...(cockpitPlayerName === undefined
          ? { role: "display" as const, crewSize }
          : { role: "solo" as const, playerName: cockpitPlayerName }),
        protocolVersion: PROTOCOL_VERSION,
        // Absent means the preset's own hull, so a display that could not reach
        // the catalogue still opens a room.
        ...(shipArchetypeId === undefined ? {} : { shipArchetypeId }),
        // Sent only when a tester asked for one, so an ordinary create carries
        // exactly what it always did.
        ...(startWave > 1 ? { startWave } : {})
      });
      roomReference.current = room;
      room.onStateChange((state) => {
        if (roomReference.current === room) applyRoomState(state);
      });
      applyRoomState(room.state);
      room.onMessage(serverMessage.latencyProbe, (payload: unknown) => {
        const result = serverLatencyProbeSchema.safeParse(payload);
        if (!result.success) return;
        room.send(clientMessage.latencyPong, {
          protocolVersion: PROTOCOL_VERSION,
          roomId: room.roomId,
          probeId: result.data.probeId
        });
      });
      /*
       * The refusals the room sends back. The display never listened for these
       * — it had nothing to send and so nothing to be refused — and the cockpit
       * inherited that silence: every rejected packet went to a channel with no
       * handler, and the ship simply did not move, with the reason sitting one
       * unregistered listener away.
       */
      room.onMessage(serverMessage.error, (payload: unknown) => {
        const parsed = serverErrorSchema.safeParse(payload);
        const reason = parsed.success ? parsed.data.code : "unknown";
        /*
         * `invalid_phase` on the continuous streams is expected and means
         * nothing: a packet in flight when the wave ends lands after the room
         * has left combat, and the room says so. Painting that on screen — and
         * never clearing it — turned a transient into a banner that sat over
         * the intermission reading "Gameplay input requires combat", which is
         * why the upgrade cards looked broken when they were not.
         */
        // Always in the console: a refusal nobody can see is what turned this
        // into three rounds of guessing. Only the banner is filtered.
        console.warn(`Room refused a command: ${reason}`);
        if (reason === "invalid_phase") return;
        if (cockpitPlayerReference.current !== undefined) {
          setError(parsed.success ? parsed.data.message : "Команда отклонена.");
        }
      });
      room.onMessage(serverMessage.roomClosing, (payload: unknown) => {
        const result = roomClosingSchema.safeParse(payload);
        if (!result.success || roomReference.current !== room) return;
        room.reconnection.enabled = false;
        roomReference.current = undefined;
        resetToCreate(roomClosingMessage(result.data.reason));
      });
      room.onDrop(() => {
        if (roomReference.current !== room) return;
        statusReference.current = "reconnecting";
        setStatus("reconnecting");
        setError("Связь прервана. Восстанавливаем общий экран…");
        setConnectionEpoch((value) => value + 1);
      });
      room.onReconnect(() => {
        if (roomReference.current !== room) return;
        statusReference.current = "connected";
        setStatus("connected");
        setError("");
      });
      room.onError((_code, message) => {
        if (roomReference.current !== room) return;
        statusReference.current = "error";
        setStatus("error");
        setError(message ?? "Сервер сообщил об ошибке.");
      });
      room.onLeave(() => {
        if (roomReference.current !== room) return;
        roomReference.current = undefined;
        resetToCreate("Комната закрыта. Создайте новую сессию.");
      });
      return room.roomId;
    } catch (reason) {
      statusReference.current = "error";
      setStatus("error");
      setError(createFailureMessage(reason));
      return undefined;
    }
  }

  function applyRoomState(state: NetworkRoomState): void {
    // The flatten and the schema parse, timed together: they are what stands
    // between a patch arriving and React being told about it, and on a phone
    // that is the work landing twenty times a second.
    const startedAt = performance.now();
    /*
     * A patch the contract refuses must not stop the world.
     *
     * The parse throws, and an exception out of a state callback takes the page
     * with it: the world stands still while a locally predicted ship flies on,
     * which is what a frozen screen has twice turned out to be. Keeping the last
     * good view is a worse picture than the newest one and an incomparably
     * better one than none, and the count says the picture is stale rather than
     * letting it look merely quiet.
     */
    let next: DisplayRoomView | undefined;
    try {
      next = toDisplayRoomView(state);
    } catch (reason) {
      refusedPatchesReference.current += 1;
      if (refusedPatchesReference.current === 1) {
        console.error("A patch did not match the display contract; holding the last one.", reason);
      }
      return;
    }
    const builtInMs = performance.now() - startedAt;
    if (next === undefined) return;
    recordSnapshotWork(builtInMs, startedAt);
    // The scene gets it now, whatever the page does: it draws from this
    // reference every frame, and a shell that waited for a React commit would
    // appear late for exactly as long as the commit was deferred.
    setLiveView(next);
    /*
     * Straight into the store, on the patch rather than on the page's slower
     * publish clock. A panel subscribed to a slice pays only when that slice
     * moves, so there is nothing to coalesce for it - and the throttle below
     * exists for the tree that still re-renders whole, not for them.
     */
    publishWorld(next);
    // Published from here rather than from a render: the Node bot reading it
    // steers on what it sees, and it must not inherit the page's slow clock.
    if (visibleDemo && next.game !== null) {
      publishVisibleDemoWorld(globalThis, buildVisibleDemoWorld(next.game, Date.now()));
    }
    /*
     * Only on the way in, not on every patch.
     *
     * Setting a state to the value it already holds is not free: React renders
     * the component once more before it bails out, and this one is the root -
     * so a call meant for the moment a connection comes up was re-rendering the
     * whole page twenty-six times a second, and every battle panel with it. It
     * measured as the two dearest panels on the screen and it was neither.
     */
    if (statusReference.current !== "connected") {
      statusReference.current = "connected";
      setStatus("connected");
    }

    publisher.offer(next, performance.now());
  }

  function resetToCreate(message: string): void {
    setLiveView(undefined);
    publisher.reset();
    publishWorld(undefined);
    statusReference.current = "idle";
    setStatus("idle");
    setError(message);
    setConnectionEpoch(0);
    setClosingRoom(false);
  }

  async function handleCloseRoom(): Promise<void> {
    const room = roomReference.current;
    if (room === undefined || !confirmDisplayRoomClose((message) => window.confirm(message))) {
      return;
    }

    setClosingRoom(true);
    roomReference.current = undefined;
    try {
      await closeDisplayRoom(room);
      resetToCreate("Комната закрыта общим экраном.");
    } catch {
      resetToCreate("Не удалось подтвердить закрытие комнаты. Создайте новую сессию.");
    }
  }

  return {
    view: networkView,
    status,
    error,
    closingRoom,
    connectionEpoch,
    cockpitPlayer,
    cockpitSeat,
    room: roomReference.current,
    sessionId: roomReference.current?.sessionId ?? "",
    createRoom,
    closeRoom: handleCloseRoom,
    sendCockpitReady,
    sendCockpitVote,
    readSocket: () => {
      // The socket itself, not the SDK transport around it: the transport has
      // no listeners to add, and everything the room sends passes through the
      // socket's own `send`.
      const connection = roomReference.current?.connection as
        { transport?: { ws?: unknown } } | undefined;
      return connection?.transport?.ws;
    }
  };
}
