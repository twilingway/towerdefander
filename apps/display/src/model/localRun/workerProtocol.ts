import type { UpgradeVoteCommand } from "@spaceship-defender/game-core";
import type { BalanceTuning, DisplayRoomView } from "@spaceship-defender/protocol";

import type { PredictedPoseFrame } from "../shipPrediction.js";
import type { LocalIntent } from "./engine.js";

/**
 * What the page and the run's worker say to each other.
 *
 * The run moved off the main thread because on a phone its step was the largest
 * piece of the frame the page could give away - four milliseconds of a
 * thirty-two millisecond frame on a Redmi 4X - and a phone has cores sitting
 * idle while one of them misses the frame. Everything that crosses this line is
 * plain data: the config is rebuilt on the other side from the tuning, because
 * the tuning is JSON and the config is a derived object nobody promised is
 * cloneable.
 */
export type ToRunWorker =
  | {
      readonly type: "start";
      readonly tuning: BalanceTuning;
      readonly shipArchetypeId: string;
      readonly playerName: string;
      readonly startWave: number;
      readonly waveTtlSeconds: number;
    }
  | { readonly type: "intent"; readonly intent: LocalIntent }
  | { readonly type: "paused"; readonly paused: boolean }
  | { readonly type: "vote"; readonly command: UpgradeVoteCommand }
  | { readonly type: "restart" };

export type FromRunWorker =
  /** After every step batch: where the hull is, for the frame about to be drawn. */
  | { readonly type: "pose"; readonly pose: PredictedPoseFrame }
  /** At the patch rate: the whole frame, already adapted and checked. */
  | { readonly type: "view"; readonly view: DisplayRoomView }
  /** Anything thrown inside the worker, said out loud on the page. */
  | { readonly type: "error"; readonly message: string };
