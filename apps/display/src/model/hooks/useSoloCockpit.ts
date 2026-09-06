import { useEffect, useRef } from "react";

import {
  LatestInputScheduler,
  assistedAimDirection,
  coneForReach,
  type AimObstacle,
  type AimTarget,
  type ControlVector
} from "@spaceship-defender/client-shared";
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

/** What the assist needs to see. Absent while there is no snapshot yet. */
export interface SoloCockpitWorld {
  readonly shooter: { readonly x: number; readonly y: number };
  readonly targets: readonly AimTarget[];
  readonly obstacles: readonly AimObstacle[];
  /** How far the cannon actually reaches; the cone is cut to it. */
  readonly cannonReach: number;
}

export interface SoloCockpitOptions {
  readonly enabled: boolean;
  /** Off sends the raw thumb bearing, whatever is in the cone. */
  readonly aimAssistEnabled: boolean;
  readonly world: SoloCockpitWorld | undefined;
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
/**
 * A scheduler is born enabled and starts heartbeating the moment anything
 * flushes it. The cockpit's two are created long before there is a cockpit, so
 * they are silenced at birth and only the gate below turns them on.
 */
function silentUntilEnabled<T>(scheduler: LatestInputScheduler<T>): LatestInputScheduler<T> {
  scheduler.setEnabled(false);
  return scheduler;
}

export function useSoloCockpit({
  enabled,
  aimAssistEnabled,
  world,
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
  const assistReference = useRef({ enabled: aimAssistEnabled, world });
  assistReference.current = { enabled: aimAssistEnabled, world };

  const pilotReference = useRef<PilotStream>(NEUTRAL_PILOT);
  const gunnerReference = useRef<GunnerStream>(NEUTRAL_GUNNER);

  const pilotSchedulerReference = useRef<LatestInputScheduler<PilotStream> | undefined>(undefined);
  const gunnerSchedulerReference = useRef<LatestInputScheduler<GunnerStream> | undefined>(
    undefined
  );
  pilotSchedulerReference.current ??= silentUntilEnabled(
    new LatestInputScheduler(NEUTRAL_PILOT, ({ sequence, value }) => {
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
    })
  );
  gunnerSchedulerReference.current ??= silentUntilEnabled(
    new LatestInputScheduler(NEUTRAL_GUNNER, ({ sequence, value }) => {
      const { roomId: room, playerId: player, runNumber: run } = envelopeReference.current;
      sendReference.current(clientMessage.gunnerInput, {
        protocolVersion: PROTOCOL_VERSION,
        roomId: room,
        playerId: player,
        runNumber: run,
        sequence,
        // Resolved here rather than where the thumb moved, because the world
        // keeps moving after it stops: a target that drifts out of the cone
        // between two pushes must stop being the answer, and this is the last
        // moment before the bearing leaves.
        aim: resolveAim(value),
        firing: value.firing
      });
    })
  );

  function resolveAim(value: GunnerStream): ControlVector {
    const { enabled: assistOn, world: snapshot } = assistReference.current;
    if (!assistOn || snapshot === undefined) return value.aim;
    return assistedAimDirection(
      {
        shooter: snapshot.shooter,
        direction: value.aim,
        targets: snapshot.targets,
        obstacles: snapshot.obstacles,
        cone: coneForReach(snapshot.cannonReach)
      },
      { enabled: true, firing: value.firing }
    );
  }

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
    /*
     * The gate, and it has to be a real one.
     *
     * This hook is mounted on every display, cockpit or not, because hooks
     * cannot hide behind a branch. A scheduler heartbeats from its first flush
     * whether or not anything changed, so an ordinary shared screen was sending
     * pilot and gunner packets it has no seat for -- twenty a second, answered
     * with `not_controller`, against a ceiling of twenty-five.
     */
    pilot?.setEnabled(enabled);
    gunner?.setEnabled(enabled);
    if (generationReference.current !== generation) {
      generationReference.current = generation;
      pilotReference.current = NEUTRAL_PILOT;
      gunnerReference.current = NEUTRAL_GUNNER;
      pilot?.resetGeneration(NEUTRAL_PILOT, performance.now(), enabled);
      gunner?.resetGeneration(NEUTRAL_GUNNER, performance.now(), enabled);
    }
    if (!enabled) return;
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
