export interface Point {
  readonly x: number;
  readonly y: number;
}

export function getBoundedCameraScroll(
  focus: Point,
  worldWidth: number,
  worldHeight: number,
  viewportWidth: number,
  viewportHeight: number
): Point {
  return {
    x: clamp(focus.x - viewportWidth / 2, 0, Math.max(0, worldWidth - viewportWidth)),
    y: clamp(focus.y - viewportHeight / 2, 0, Math.max(0, worldHeight - viewportHeight))
  };
}

export function interpolatePoint(current: Point, target: Point, amount: number): Point {
  const safeAmount = clamp(amount, 0, 1);
  return {
    x: current.x + (target.x - current.x) * safeAmount,
    y: current.y + (target.y - current.y) * safeAmount
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
