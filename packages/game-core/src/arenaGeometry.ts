export interface ArenaCircle {
  readonly centerX: number;
  readonly centerY: number;
  readonly radius: number;
}

export interface MovingCircle {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly velocity: {
    readonly x: number;
    readonly y: number;
  };
}

export interface ConstrainedMovingCircle {
  readonly x: number;
  readonly y: number;
  readonly velocity: {
    readonly x: number;
    readonly y: number;
  };
}

export function squaredDistance(
  firstX: number,
  firstY: number,
  secondX: number,
  secondY: number
): number {
  return (firstX - secondX) ** 2 + (firstY - secondY) ** 2;
}

export function isCircleContainedInArena(
  x: number,
  y: number,
  entityRadius: number,
  arena: ArenaCircle
): boolean {
  const legalRadius = arena.radius - entityRadius;
  return (
    legalRadius >= 0 &&
    squaredDistance(x, y, arena.centerX, arena.centerY) <= legalRadius * legalRadius
  );
}

/**
 * Constrains a moving circle without changing its tangential or inward velocity.
 * The zero-distance branch avoids inventing a normal at the arena center.
 */
export function constrainMovingCircleToArena(
  circle: MovingCircle,
  arena: ArenaCircle
): ConstrainedMovingCircle {
  const legalRadius = arena.radius - circle.radius;
  if (!Number.isFinite(legalRadius) || legalRadius < 0) {
    throw new RangeError("arena must fit the moving circle");
  }

  const deltaX = circle.x - arena.centerX;
  const deltaY = circle.y - arena.centerY;
  const distanceSquared = deltaX * deltaX + deltaY * deltaY;
  if (distanceSquared <= legalRadius * legalRadius) {
    return {
      x: circle.x,
      y: circle.y,
      velocity: circle.velocity
    };
  }

  const distance = Math.sqrt(distanceSquared);
  if (distance === 0) {
    return {
      x: arena.centerX,
      y: arena.centerY,
      velocity: circle.velocity
    };
  }

  const normalX = deltaX / distance;
  const normalY = deltaY / distance;
  const outwardSpeed = circle.velocity.x * normalX + circle.velocity.y * normalY;
  const removedOutwardSpeed = Math.max(0, outwardSpeed);

  return {
    x: arena.centerX + normalX * legalRadius,
    y: arena.centerY + normalY * legalRadius,
    velocity: {
      x: circle.velocity.x - normalX * removedOutwardSpeed,
      y: circle.velocity.y - normalY * removedOutwardSpeed
    }
  };
}

/** Tests a complete entity circle against a radial cleanup envelope. */
export function isWithinCircularEnvelope(
  x: number,
  y: number,
  entityRadius: number,
  arena: ArenaCircle,
  padding = 0
): boolean {
  if (!Number.isFinite(entityRadius) || entityRadius < 0) {
    throw new RangeError("entityRadius must be a non-negative finite number");
  }
  if (!Number.isFinite(padding) || padding < 0) {
    throw new RangeError("padding must be a non-negative finite number");
  }
  const envelopeRadius = arena.radius + padding - entityRadius;
  return (
    envelopeRadius >= 0 &&
    squaredDistance(x, y, arena.centerX, arena.centerY) <= envelopeRadius * envelopeRadius
  );
}
