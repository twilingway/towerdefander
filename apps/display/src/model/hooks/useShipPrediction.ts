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

export function useShipPrediction({
  room,
  enabled,
  source,
  world,
  onPose
}: {
  readonly room: Room<unknown, { game?: { display?: { pose?: DecodedPose } } }> | undefined;
  readonly enabled: boolean;
  readonly source: ShipPredictionSource;
  readonly world: PredictionWorld | undefined;
  readonly onPose: (pose: PredictedPoseFrame | undefined) => void;
}): void {
  const latest = useRef({ source, world, enabled, onPose });
  latest.current = { source, world, enabled, onPose };

  useEffect(() => {
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

    let running = true;
    const frame = () => {
      if (!running) return;
      /*
       * Step, send, then read. The order is the contract: `tick()` says how
       * many fixed steps are due, each one is transmitted so the server applies
       * exactly what was predicted, and only afterwards is the pose worth
       * reading.
       */
      const steps = predict.tick();
      const { source: live, enabled: on, onPose: publish } = latest.current;
      for (let step = 0; step < steps; step += 1) {
        if (!on) break;
        const intent = live.readIntent();
        Object.assign(input.data, intent);
        input.send();
      }
      publish(on ? reconciler.state : undefined);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);

    return () => {
      running = false;
      latest.current.onPose(undefined);
    };
  }, [room]);
}
