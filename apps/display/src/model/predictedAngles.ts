import type { PredictedPoseFrame } from "./shipPrediction.js";

/**
 * Which ship the canvas is handed: the one this page is flying, or the one the
 * room last said.
 *
 * The switch exists so the two can be compared on one connection and one tick.
 * Turned off, nothing about what the page sends changes - only what it draws -
 * because a switch that also changed the traffic would be comparing two
 * different games.
 */
export function withPredictedPose<
  T extends {
    spaceship: { x: number; y: number; velocityX: number; velocityY: number; heading: number };
    turretAngle: number;
  }
>(game: T, pose: PredictedPoseFrame | undefined, enabled: boolean): T {
  if (!enabled || pose === undefined) return game;
  return {
    ...game,
    spaceship: {
      ...game.spaceship,
      x: pose.x,
      y: pose.y,
      velocityX: pose.velocityX,
      velocityY: pose.velocityY,
      heading: pose.heading
    },
    turretAngle: pose.turretAngle
  };
}
