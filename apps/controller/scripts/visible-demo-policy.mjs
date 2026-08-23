const TURN_MS = 18_000;

export function pilotVector(elapsedMs) {
  const angle = ((elapsedMs % TURN_MS) / TURN_MS) * Math.PI * 2;
  return normalize({ x: Math.cos(angle), y: Math.sin(angle) });
}

export function interceptAim(spaceship, target, projectileSpeed = 720) {
  if (target === undefined) return { x: 1, y: 0 };
  const relativeX = target.x - spaceship.x;
  const relativeY = target.y - spaceship.y;
  const velocityX = target.velocityX ?? 0;
  const velocityY = target.velocityY ?? 0;
  const quadratic = velocityX ** 2 + velocityY ** 2 - projectileSpeed ** 2;
  const linear = 2 * (relativeX * velocityX + relativeY * velocityY);
  const constant = relativeX ** 2 + relativeY ** 2;
  const discriminant = linear ** 2 - 4 * quadratic * constant;
  let seconds = 0;

  if (discriminant >= 0 && Math.abs(quadratic) > 1e-9) {
    const root = Math.sqrt(discriminant);
    const candidates = [
      (-linear - root) / (2 * quadratic),
      (-linear + root) / (2 * quadratic)
    ].filter((candidate) => candidate > 0);
    if (candidates.length > 0) seconds = Math.min(...candidates);
  }

  return normalize({
    x: relativeX + velocityX * seconds,
    y: relativeY + velocityY * seconds
  });
}

export function directAim(spaceship, target) {
  if (target === undefined) return { x: 1, y: 0 };
  return normalize({ x: target.x - spaceship.x, y: target.y - spaceship.y });
}

export function nextShieldActive(current, energy) {
  if (energy <= 8) return false;
  if (energy >= 70) return true;
  return current;
}

export function runWaveKey(runNumber, waveNumber) {
  return `${String(runNumber)}:${String(waveNumber)}`;
}

export function normalize(vector) {
  const length = Math.hypot(vector.x, vector.y);
  if (length <= Number.EPSILON) return { x: 1, y: 0 };
  return { x: vector.x / length, y: vector.y / length };
}
