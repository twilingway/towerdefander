import { useEffect, useRef } from "react";

import { LatestInputScheduler, type ControlVector } from "@spaceship-defender/client-shared";
import { PROTOCOL_VERSION, clientMessage } from "@spaceship-defender/protocol";

const NEUTRAL: ControlVector = { x: 0, y: 0 };
/** Same cadence the controller flushes at; the scheduler decides what leaves. */
const FLUSH_MS = 25;

interface PilotStream {
  readonly vector: ControlVector;
  readonly mgFiring: boolean;
}

interface GunnerStream {
  readonly aim: ControlVector;
  readonly firing: boolean;
}

const NEUTRAL_PILOT: PilotStream = { vector: NEUTRAL, mgFiring: false };
const NEUTRAL_GUNNER: GunnerStream = { aim: NEUTRAL, firing: false };

export interface SoloCockpitOptions {
  readonly enabled: boolean;
  readonly roomId: string;
  readonly playerId: string;
  readonly runNumber: number;
  /**
   * Changes whenever the sequences must start over — a new run, or a new
   * connection. Same idea as the controller's, and for the same reason: the
   * room watermarks sequences and would drop a stream that resumed mid-count.
   */
  readonly generation: string;
  readonly send: (type: string, payload: unknown) => void;
}

export interface SoloCockpitControls {
  readonly onDrive: (vector: ControlVector, strength: number) => void;
  readonly onDriveRelease: () => void;
  readonly onAim: (vector: ControlVector, strength: number) => void;
  readonly onAimRelease: () => void;
  readonly onMachineGunHold: (held: boolean) => void;
  readonly onCannonHold: (held: boolean) => void;
}

/**
 * The wire half of the solo cockpit: two streams, two sequences, one socket.
 *
 * They are separate schedulers rather than one, because the room watermarks
 * sequences per message type — sharing a counter would be legal but would make
 * a dropped pilot packet look like a replayed gunner packet in the logs. The
 * split is also what lets a thumb on each stick be genuinely simultaneous.
 */
export function useSoloCockpit({
  enabled,
  roomId,
  playerId,
  runNumber,
  generation,
  send
}: SoloCockpitOptions): SoloCockpitControls {
  const sendReference = useRef(send);
  sendReference.current = send;
  const envelopeReference = useRef({ roomId, playerId, runNumber });
  envelopeReference.current = { roomId, playerId, runNumber };

  const pilotReference = useRef<PilotStream>(NEUTRAL_PILOT);
  const gunnerReference = useRef<GunnerStream>(NEUTRAL_GUNNER);

  const pilotSchedulerReference = useRef<LatestInputScheduler<PilotStream> | undefined>(undefined);
  const gunnerSchedulerReference = useRef<LatestInputScheduler<GunnerStream> | undefined>(
    undefined
  );
  pilotSchedulerReference.current ??= new LatestInputScheduler(
    NEUTRAL_PILOT,
    ({ sequence, value }) => {
      const { roomId: room, playerId: player, runNumber: run } = envelopeReference.current;
      sendReference.current(clientMessage.pilotInput, {
        protocolVersion: PROTOCOL_VERSION,
        roomId: room,
        playerId: player,
        runNumber: run,
        sequence,
        vector: value.vector,
        mgFiring: value.mgFiring
      });
    }
  );
  gunnerSchedulerReference.current ??= new LatestInputScheduler(
    NEUTRAL_GUNNER,
    ({ sequence, value }) => {
      const { roomId: room, playerId: player, runNumber: run } = envelopeReference.current;
      sendReference.current(clientMessage.gunnerInput, {
        protocolVersion: PROTOCOL_VERSION,
        roomId: room,
        playerId: player,
        runNumber: run,
        sequence,
        aim: value.aim,
        firing: value.firing
      });
    }
  );

  function updatePilot(patch: Partial<PilotStream>): void {
    const next = { ...pilotReference.current, ...patch };
    pilotReference.current = next;
    pilotSchedulerReference.current?.update(next, performance.now());
  }

  function updateGunner(patch: Partial<GunnerStream>): void {
    const next = { ...gunnerReference.current, ...patch };
    gunnerReference.current = next;
    gunnerSchedulerReference.current?.update(next, performance.now());
  }

  const generationReference = useRef(generation);
  useEffect(() => {
    const pilot = pilotSchedulerReference.current;
    const gunner = gunnerSchedulerReference.current;
    if (generationReference.current !== generation) {
      generationReference.current = generation;
      pilotReference.current = NEUTRAL_PILOT;
      gunnerReference.current = NEUTRAL_GUNNER;
      pilot?.resetGeneration(NEUTRAL_PILOT, performance.now(), enabled);
      gunner?.resetGeneration(NEUTRAL_GUNNER, performance.now(), enabled);
    }
    const timer = window.setInterval(() => {
      pilot?.flush(performance.now());
      gunner?.flush(performance.now());
    }, FLUSH_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [enabled, generation]);

  useEffect(() => {
    // A phone that locks or a tab that goes away must not leave the ship under
    // power with both triggers down.
    function neutralize(): void {
      updatePilot({ vector: NEUTRAL, mgFiring: false });
      updateGunner({ aim: NEUTRAL, firing: false });
    }
    function onVisibilityChange(): void {
      if (document.visibilityState === "hidden") neutralize();
    }
    if (!enabled) neutralize();
    window.addEventListener("blur", neutralize);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("blur", neutralize);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [enabled]);

  return {
    onDrive: (vector, strength) => {
      /*
       * Direction from the stick, throttle from the strength. The core clamps
       * a pilot vector to unit length but keeps a shorter one, so the length
       * IS the throttle — and the strength is the figure that already had the
       * dead zone taken out of it.
       */
      const length = Math.hypot(vector.x, vector.y);
      const scale = length > 0 ? strength / length : 0;
      updatePilot({ vector: { x: vector.x * scale, y: vector.y * scale } });
    },
    onDriveRelease: () => {
      updatePilot({ vector: NEUTRAL });
    },
    onAim: (vector) => {
      // Length carries nothing here: a bearing is a bearing. A zero vector is
      // meaningful on its own — the core reads it as "keep the one you have".
      updateGunner({ aim: vector });
    },
    onAimRelease: () => {
      updateGunner({ aim: NEUTRAL });
    },
    onMachineGunHold: (held) => {
      updatePilot({ mgFiring: held });
    },
    onCannonHold: (held) => {
      updateGunner({ firing: held });
    }
  };
}
