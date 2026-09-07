import { createSpaceshipSimulationConfig } from "@spaceship-defender/game-core";
import { Predict, type Room } from "@colyseus/sdk";
import { SoloInput } from "@spaceship-defender/protocol";
import { useEffect, useRef } from "react";

import {
  PREDICTED_POSE_FIELDS,
  stepPredictedPose,
  toShipStats,
  type PredictedInputFrame,
  type PredictedPoseFrame
} from "../shipPrediction.js";

/**
 * Runs the ship locally and reconciles it with the room.
 *
 * The loop is the one the SDK prescribes and the lab spells out: ask how many
 * fixed steps are due, send exactly that many input frames, and only then read
 * for drawing. Reading between the two is a step stale, and a step stale at
 * twenty hertz is what a hand feels as lag.
 */

/** What the cockpit hands over each frame; the wire shape, already resolved. */
export interface ShipPredictionSource {
  readIntent(): PredictedInputFrame;
  readonly enabled: boolean;
}

export interface ShipPredictionHandle {
  /** The predicted pose to draw, or undefined before the first patch. */
  readPose(): PredictedPoseFrame | undefined;
  /** How many of our own frames the room has not acknowledged yet. */
  readPending(): number;
}

interface DecodedPose extends PredictedPoseFrame {
  readonly $?: unknown;
}

type PredictHandle = ReturnType<typeof Predict.get>;

/**
 * The drive numbers and the arena the replay steps with.
 *
 * Read fresh every frame rather than captured once: a module bought mid-run
 * moves them, and a replay against the numbers the ship had an hour ago is the
 * drift this whole mechanism exists to avoid.
 */
export interface PredictionWorld {
  readonly drive: Parameters<typeof toShipStats>[0];
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly arenaRadius: number;
  readonly turretMountedOnHull: boolean;
}

export function useShipPrediction<TState extends { game?: { display?: { pose?: DecodedPose } } }>({
  room,
  enabled,
  source,
  world,
  onDriver,
  onPending
}: {
  readonly room: Room<unknown, TState> | undefined;
  readonly enabled: boolean;
  readonly source: ShipPredictionSource;
  readonly world: PredictionWorld | undefined;
  /**
   * Called every animation frame with the pose to draw.
   *
   * It must NOT set React state. This runs at frame rate, and pushing a new
   * value into a component from here re-renders the whole battle tree sixty to
   * a hundred and sixty times a second - which froze a phone within seconds of
   * the first run and is the very tax prediction is here to remove. Write it to
   * a ref; the scene reads the ref.
   */
  /**
   * Handed the function the scene must call once per drawn frame, or undefined
   * when there is nothing to drive.
   */
  readonly onDriver: (drive: (() => PredictedPoseFrame | undefined) | undefined) => void;
  /**
   * How deep the replay is: frames we have sent that the room has not
   * acknowledged.
   *
   * The number that tells a healthy prediction from a drowning one. It should
   * sit at a couple of frames - one round trip. Climbing means the room is not
   * spending what we send, and every ack then replays a longer and longer
   * buffer until the device gives up.
   */
  readonly onPending?: (pending: number, driftEma: number) => void;
}): void {
  const latest = useRef({ source, world, enabled, onDriver, onPending });
  latest.current = { source, world, enabled, onDriver, onPending };

  useEffect(() => {
    if (room === undefined) return undefined;
    try {
      return start();
    } catch (error) {
      /*
       * Prediction is an improvement, never a dependency.
       *
       * It threw once already - the room advertises a wake interval rather than
       * a step - and it took the whole display down with it, because a hook
       * that throws in an effect has no boundary above it. A screen that draws
       * the authoritative ship is a worse screen; a screen that draws nothing
       * is not a screen.
       */
      console.error("Ship prediction is off: it could not start.", error);
      latest.current.onDriver(undefined);
      return undefined;
    }

    function start(): (() => void) | undefined {
      if (room === undefined) return undefined;
      const pose = room.state.game?.display?.pose;
      if (pose === undefined) return undefined;

      /*
       * The one cast in the file, and it is a boundary rather than a shortcut.
       *
       * This app types room state structurally on purpose - `roomView` never
       * imports the server's schema classes, which is what keeps the display from
       * depending on the room's internals. The predictor, however, works on the
       * decoded tree itself. So the two meet here, once, and everything past this
       * line is typed again.
       */
      const predict: PredictHandle = Predict.get(
        room as unknown as Parameters<typeof Predict.get>[0],
        { mode: "lerp", delay: 100 }
      );
      const input = room.input({ type: SoloInput });
      const reconciler = predict.reconciler(pose, {
        input,
        fields: [...PREDICTED_POSE_FIELDS],
        step: (_ctx, state, command) => {
          const current = latest.current.world;
          if (current === undefined) return;
          stepPredictedPose(
            state,
            command,
            createSpaceshipSimulationConfig({
              worldWidth: current.worldWidth,
              worldHeight: current.worldHeight,
              arenaRadius: current.arenaRadius,
              turretMountedOnHull: current.turretMountedOnHull
            }),
            toShipStats(current.drive)
          );
        },
        // Corrections are eased in rather than snapped. Roughly two thirds of any
        // gap closes per this many milliseconds, which is the price of not seeing
        // the ship jump when the room disagrees.
        smoothMs: 65
      });

      /*
       * One function, called by the scene at the top of the frame it draws.
       *
       * Not a loop of its own: the order - step, send exactly what was stepped,
       * then read - has to happen inside the frame that draws, or the scene reads
       * a pose staged one callback ago, and a step stale is what a hand reads as
       * stutter. The lab states the same order in the same place.
       */
      let seq = 0;
      const drive = (): PredictedPoseFrame | undefined => {
        const steps = predict.tick();
        const { source: live, enabled: on, world } = latest.current;
        for (let step = 0; step < steps; step += 1) {
          if (!on) break;
          Object.assign(input.data, live.readIntent());
          /*
           * The stamp is ours to write.
           *
           * The room dedupes on it and acks by it, and a frame that never
           * carries one is acknowledged as zero forever: the room applies every
           * frame, agrees with every frame, and the client still counts them all
           * as in flight, because nothing it sent was ever confirmed. The drive
           * revision rides along for the same reason the lab sends its profile
           * index - a replay has to use the numbers that produced the frame, and
           * ours move whenever a module is bought.
           */
          input.data.seq = ++seq;
          input.data.driveRevision = world?.drive.revision ?? 0;
          input.send();
        }
        latest.current.onPending?.(input.pendingCount, reconciler.drift.ema);
        if (!on) return undefined;
        /*
         * Position through `value()`, bearings straight from the state.
         *
         * The step runs twenty times a second; read raw it draws twenty positions
         * a second and nothing between them, which is why prediction looked
         * jerkier than the interpolation it replaced. Bearings must not go
         * through it: it interpolates numerically, and a value crossing PI would
         * take the long way round every time.
         */
        const state = reconciler.state as PredictedPoseFrame;
        return { ...state, x: reconciler.value("x"), y: reconciler.value("y") };
      };
      latest.current.onDriver(drive);

      return () => {
        latest.current.onDriver(undefined);
      };
    }
  }, [room]);
}
