import { useEffect, useRef } from "react";

import {
  LatestInputScheduler,
  assistedAimDirection,
  coneForReach,
  smoothHeadingVector,
  type AimObstacle,
  type AimTarget,
  type ControlVector
} from "@spaceship-defender/client-shared";
import { PROTOCOL_VERSION, clientMessage } from "@spaceship-defender/protocol";

const NEUTRAL: ControlVector = { x: 0, y: 0 };
/**
 * How far off the gun has to be for the traverse to be asked for in full. The
 * hull's own lead is 0.45 rad and this is the same idea on the same feel.
 */
const TRAVERSE_LEAD_RADIANS = 0.45;

/** Shortest signed way round, in (-PI, PI]. */
function shortestArc(from: number, to: number): number {
  const TAU = Math.PI * 2;
  return ((((to - from + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
}
/** Same cadence the controller flushes at; the scheduler decides what leaves. */
const FLUSH_MS = 25;

interface PilotStream {
  readonly vector: ControlVector;
  readonly mgFiring: boolean;
}

interface GunnerStream {
  readonly aim: ControlVector;
  readonly firing: boolean;
  /** Requested traverse; null while the stick is not asking for one. */
  readonly turn: number | null;
}

const NEUTRAL_PILOT: PilotStream = { vector: NEUTRAL, mgFiring: false };
const NEUTRAL_GUNNER: GunnerStream = { aim: NEUTRAL, firing: false, turn: 0 };

/** What the assist needs to see. Absent while there is no snapshot yet. */
export interface SoloCockpitWorld {
  readonly shooter: { readonly x: number; readonly y: number };
  readonly targets: readonly AimTarget[];
  readonly obstacles: readonly AimObstacle[];
  /** How far the cannon actually reaches; the cone is cut to it. */
  readonly cannonReach: number;
  /** Where the gun is pointing right now, straight from the snapshot. */
  readonly turretAngle: number;
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
  /**
   * The cannon has two spurs and either may hold it: the aim stick itself, the
   * way STEEL VOID does it (`_beginAimFire` sets `fireHeld` on the touch that
   * starts aiming), and the separate trigger for firing without moving the
   * gun. They are reported apart so releasing one does not silence the other.
   */
  readonly onCannonFromStick: (held: boolean) => void;
  readonly onCannonFromTrigger: (held: boolean) => void;
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
  /** Which spurs are down; the cannon fires while either is. */
  const cannonSpursReference = useRef({ stick: false, trigger: false });
  /*
   * The bearing each stick is currently sending, and when it was last touched.
   * A thumb is never still: two pixels of slip on the ring is a couple of
   * degrees of commanded heading, and without this the hull and the gun shake
   * with it. The lab measured 4.58 degrees of swing before the same guard.
   */
  const driveHeadingReference = useRef<number | null>(null);
  const aimHeadingReference = useRef<number | null>(null);
  const lastSampleAtReference = useRef<number | null>(null);

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
        firing: value.firing,
        // Zero is a real order — "stop" — so it travels like any other.
        ...(value.turn === null ? {} : { turn: value.turn })
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

  /** Seconds since the last stick sample, clamped so a stall cannot jump it. */
  function stepSeconds(): number {
    const now = performance.now();
    const previous = lastSampleAtReference.current;
    lastSampleAtReference.current = now;
    if (previous === null) return 0;
    return Math.min(0.25, Math.max(0, (now - previous) / 1000));
  }

  function anyCannonSpurDown(): boolean {
    const spurs = cannonSpursReference.current;
    return spurs.stick || spurs.trigger;
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
      cannonSpursReference.current = { stick: false, trigger: false };
      driveHeadingReference.current = null;
      aimHeadingReference.current = null;
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
      const smoothed = smoothHeadingVector(driveHeadingReference.current, vector, stepSeconds());
      if (smoothed === null) {
        updatePilot({ vector: NEUTRAL });
        return;
      }
      driveHeadingReference.current = smoothed.heading;
      // Direction from the smoothed bearing, throttle from the strength.
      updatePilot({ vector: { x: smoothed.x * strength, y: smoothed.y * strength } });
    },
    onDriveRelease: () => {
      driveHeadingReference.current = null;
      updatePilot({ vector: NEUTRAL });
    },
    onAim: (vector) => {
      const smoothed = smoothHeadingVector(aimHeadingReference.current, vector, stepSeconds());
      if (smoothed === null) {
        updateGunner({ aim: NEUTRAL, turn: 0 });
        return;
      }
      aimHeadingReference.current = smoothed.heading;
      /*
       * The stick asks for a traverse, not a bearing.
       *
       * It still names a direction, so the rate is how far the gun is from it:
       * hold the stick and the gun closes and settles, let go and the zero
       * below stops it dead. Naming the bearing instead meant naming the
       * authoritative angle, already a patch plus a ping old, and the gun
       * sprang back to it the moment the thumb came up.
       *
       * The lead is the hull's own: past it the traverse is simply full.
       */
      const world = assistReference.current.world;
      if (world === undefined) {
        updateGunner({ aim: { x: smoothed.x, y: smoothed.y }, turn: null });
        return;
      }
      const assisted = resolveAim({
        aim: { x: smoothed.x, y: smoothed.y },
        firing: true,
        turn: null
      });
      const wanted = Math.atan2(assisted.y, assisted.x);
      const difference = shortestArc(world.turretAngle, wanted);
      updateGunner({
        aim: { x: smoothed.x, y: smoothed.y },
        turn: Math.max(-1, Math.min(1, difference / TRAVERSE_LEAD_RADIANS))
      });
    },
    onAimRelease: () => {
      /*
       * Stop where the gun is, do not coast on to where the thumb last was.
       *
       * A neutral vector keeps the stored target, so the traverse would finish
       * the turn by itself long after the stick came up — flick and let go, and
       * the gun sails round on its own. The lab turns the turret only while the
       * stick is actually pushed. The hull already had this exact problem and
       * this exact answer: a released turn key sends the current nose rather
       * than a zero, because a zero means "keep the old target".
       */
      aimHeadingReference.current = null;
      // Zero is the order to stop, and it needs no knowledge of where the gun
      // actually is — which is the whole reason the intent exists.
      updateGunner({ aim: NEUTRAL, turn: 0 });
    },
    onMachineGunHold: (held) => {
      updatePilot({ mgFiring: held });
    },
    onCannonFromStick: (held) => {
      cannonSpursReference.current.stick = held;
      updateGunner({ firing: anyCannonSpurDown() });
    },
    onCannonFromTrigger: (held) => {
      cannonSpursReference.current.trigger = held;
      updateGunner({ firing: anyCannonSpurDown() });
    }
  };
}
