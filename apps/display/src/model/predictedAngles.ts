/**
 * Which angles the canvas is handed: the predicted ones, or the authoritative
 * ones exactly as they arrived.
 *
 * The switch exists so the two can be compared on one connection and one tick.
 * Turned off, nothing about what the page sends changes - only what it draws -
 * because a switch that also changed the traffic would be comparing two
 * different games.
 */
export function withPredictedAngles<
  T extends { spaceship: { heading: number }; turretAngle: number }
>(game: T, predicted: { heading: number; turretAngle: number } | undefined, enabled: boolean): T {
  if (!enabled || predicted === undefined) return game;
  return {
    ...game,
    spaceship: { ...game.spaceship, heading: predicted.heading },
    turretAngle: predicted.turretAngle
  };
}
