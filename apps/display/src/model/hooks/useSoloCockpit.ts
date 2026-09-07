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

import type { PredictedInputFrame } from "../shipPrediction.js";

const NEUTRAL: ControlVector = { x: 0, y: 0 };
/** Same cadence the controller flushes at; the scheduler decides what leaves. */
const FLUSH_MS = 25;

interface PilotStream {
  readonly vector: ControlVector;
  readonly mgFiring: boolean;
  /**
   * Tank helm: a requested spin and a push along the nose. Null while the stick
   * is driving, which names a bearing instead — the core prefers the intent
   * whenever one arrives, so the two must not both be sent.
   */
  readonly turn: number | null;
  readonly thrust: number | null;
}

interface GunnerStream {
  readonly aim: ControlVector;
  readonly firing: boolean;
  /**
   * The bearing the thumb is asking for, or null for "stop".
   *
   * Deliberately not a rate. A rate computed where the thumb moved freezes the
   * moment the thumb stops moving — no pointermove, no recalculation — and the
   * heartbeat then repeats that stale full-speed order until the turret has
   * gone all the way round and round. Holding a stick still is the most
   * ordinary thing a player does, so the rate is worked out at send time
   * instead, against the gun's angle as it is by then.
   */
  readonly aimHeading: number | null;
}

const NEUTRAL_PILOT: PilotStream = { vector: NEUTRAL, mgFiring: false, turn: null, thrust: null };
const NEUTRAL_GUNNER: GunnerStream = { aim: NEUTRAL, firing: false, aimHeading: null };

/** What the assist needs to see. Absent while there is no snapshot yet. */
export interface SoloCockpitWorld {
  readonly shooter: { readonly x: number; readonly y: number };
  /** The nose, which a mounted gun is aimed against. */
  readonly heading: number;
  readonly targets: readonly AimTarget[];
  readonly obstacles: readonly AimObstacle[];
  /** How far the cannon actually reaches; the cone is cut to it. */
  readonly cannonReach: number;
  /** Where the gun is pointing right now, straight from the snapshot. */
  readonly turretAngle: number;
  /** Whether the hull carries the gun; it changes what a stick bearing means. */
  readonly turretMountedOnHull: boolean;
  /** The tremble guard and the traverse lead, all three from the preset. */
  readonly headingDeadbandRadians: number;
  readonly headingFilterSeconds: number;
  readonly turretLeadRadians: number;
}

export interface SoloCockpitOptions {
  readonly enabled: boolean;
  /**
   * On means the acknowledged input stream is carrying every frame, so the
   * message schedulers here stand down rather than saying the same thing twice.
   */
  readonly predicting: boolean;
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
  /** The current order in the shape the wire takes; the stream reads it per step. */
  readonly readIntent: () => PredictedInputFrame;
  readonly onDrive: (vector: ControlVector, strength: number) => void;
  readonly onDriveRelease: () => void;
  readonly onAim: (vector: ControlVector, strength: number) => void;
  readonly onAimRelease: () => void;
  readonly onMachineGunHold: (held: boolean) => void;
  /** Tank helm from the keys: spin the hull, push along the nose. */
  readonly onHelm: (intent: { readonly turn: number; readonly thrust: number }) => void;
  readonly onHelmRelease: () => void;
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
  predicting,
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
  /*
   * The last bearing the hull was actually given. The core keeps the previous
   * target when a pilot vector goes to zero, so a predictor that forgot it
   * would brake the hull the instant a thumb lifts and the authority would not.
   */
  const hullTargetReference = useRef<number | null>(null);
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
        mgFiring: value.mgFiring,
        // Only when the helm asked for one; a stick command keeps the shape it
        // has always had.
        ...(value.turn === null ? {} : { turn: value.turn, thrust: value.thrust ?? 0 })
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
        // Sent only to stop the gun; while it is being aimed the bearing above
        // is the whole order, and the core's traverse law serves it.
        ...(resolveTraverse(value) === null ? {} : { turn: 0 })
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

  /**
   * Whether the gun is being commanded to stop, or left to the core's own law.
   *
   * A rate was tried here and was the wrong instrument: proportional to the
   * error, ramped by acceleration, refreshed twenty times a second and a ping
   * behind, it is a lagging P-controller — it overshoots the bearing and hunts
   * around it, which is the spinning and the over-turning.
   *
   * `advanceAngularTraverse` in the core already does this properly: it carries
   * the braking bound `sqrt(2 * braking * remaining)` and lands exactly on the
   * target without passing it. So a pushed stick names a bearing and lets that
   * law run, and only a released one sends an intent — zero, meaning stop,
   * which is the one thing a bearing cannot say.
   */
  function resolveTraverse(value: GunnerStream): number | null {
    return value.aimHeading === null ? 0 : null;
  }

  /** The guard as the preset states it; built-ins stand in until it arrives. */
  function smoothingOptions(): { deadbandRadians?: number; tauSeconds?: number } {
    const world = assistReference.current.world;
    if (world === undefined) return {};
    return {
      deadbandRadians: world.headingDeadbandRadians,
      tauSeconds: world.headingFilterSeconds
    };
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
    /*
     * Two ways to say the same thing would say it twice. While the ship is
     * predicted the acknowledged stream carries every frame, so the message
     * schedulers stand down entirely - and come straight back when the switch
     * is thrown, which is what makes the comparison a fair one.
     */
    pilot?.setEnabled(enabled && !predicting);
    gunner?.setEnabled(enabled && !predicting);
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

  /**
   * The cockpit's current order, in the shape the wire takes.
   *
   * Read rather than pushed: the stream asks for it exactly as often as the
   * simulation steps, so a thumb held still produces the same frame again
   * rather than nothing at all - which is what a replay needs to reproduce.
   */
  function readIntent() {
    const pilot = pilotReference.current;
    const gunner = gunnerReference.current;
    const aim = resolveAim(gunner);
    const traverse = resolveTraverse(gunner);
    return {
      vectorX: pilot.vector.x,
      vectorY: pilot.vector.y,
      hasHelm: pilot.turn !== null,
      turn: pilot.turn ?? 0,
      thrust: pilot.thrust ?? 0,
      aimX: aim.x,
      aimY: aim.y,
      hasAimTurn: traverse !== null,
      aimTurn: traverse ?? 0,
      mgFiring: pilot.mgFiring,
      firing: gunner.firing
    };
  }

  return {
    readIntent,
    onDrive: (vector, strength) => {
      /*
       * Direction from the stick, throttle from the strength. The core clamps
       * a pilot vector to unit length but keeps a shorter one, so the length
       * IS the throttle — and the strength is the figure that already had the
       * dead zone taken out of it.
       */
      const smoothed = smoothHeadingVector(
        driveHeadingReference.current,
        vector,
        stepSeconds(),
        smoothingOptions()
      );
      if (smoothed === null) {
        updatePilot({ vector: NEUTRAL });
        return;
      }
      driveHeadingReference.current = smoothed.heading;
      hullTargetReference.current = smoothed.heading;
      // The stick names a bearing, so any standing helm intent is dropped.
      // Direction from the smoothed bearing, throttle from the strength.
      updatePilot({
        vector: { x: smoothed.x * strength, y: smoothed.y * strength },
        turn: null,
        thrust: null
      });
    },
    onDriveRelease: () => {
      driveHeadingReference.current = null;
      updatePilot({ vector: NEUTRAL, turn: null, thrust: null });
    },
    onHelm: (intent) => {
      // A spin names no bearing, so the remembered one goes with it.
      hullTargetReference.current = null;
      updatePilot({ vector: NEUTRAL, turn: intent.turn, thrust: intent.thrust });
    },
    onHelmRelease: () => {
      updatePilot({ vector: NEUTRAL, turn: 0, thrust: 0 });
    },
    onAim: (vector) => {
      /*
       * No smoothing here, unlike the drive stick.
       *
       * The lab filters one heading and one only — the drive stick's, in
       * `_updateDrive`. The aim path has no filter at all, and adding one was
       * my own idea: on a gun that is already rate-limited by its traverse it
       * buys nothing and costs the thumb its directness. The dead zone still
       * applies, because that comes from the stick itself.
       */
      if (vector.x === 0 && vector.y === 0) {
        aimHeadingReference.current = null;
        updateGunner({ aim: NEUTRAL, aimHeading: null });
        return;
      }
      const heading = Math.atan2(vector.y, vector.x);
      aimHeadingReference.current = heading;
      // Only the request travels from here. The rate that serves it is worked
      // out at send time, where the gun's own angle is fresh.
      updateGunner({ aim: { x: vector.x, y: vector.y }, aimHeading: heading });
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
      // Stop, and stopping needs no knowledge of where the gun actually is —
      // which is the whole reason the intent exists.
      updateGunner({ aim: NEUTRAL, aimHeading: null });
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
