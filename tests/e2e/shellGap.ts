import type { Page } from "@playwright/test";

/**
 * The muzzle-to-shell gap, computed from what the scene drew.
 *
 * The frame shape is the display's `ProbedFrame` (`shellProbe.ts`), restated
 * here rather than imported: a spec must not compile against the app's source,
 * and the two meeting only as JSON is what keeps the measurement honest.
 *
 * Nothing here reads a scene clock. An own shell is judged against the
 * authoritative point it was born at and the drawn barrel over wall time; a
 * foreign shell against the hulls drawn around it. That is what makes the
 * numbers able to disagree with the implementation they measure.
 */

export interface ProbedShell {
  readonly id: string;
  readonly own: boolean;
  readonly source: string;
  readonly radius: number;
  readonly visible: boolean;
  readonly x: number;
  readonly y: number;
  readonly velocityX: number;
  readonly velocityY: number;
  readonly birthX: number;
  readonly birthY: number;
  readonly spawnTick: number;
}

export interface ProbedFrame {
  readonly time: number;
  readonly hullX: number;
  readonly hullY: number;
  readonly heading: number;
  readonly mountX: number;
  readonly mountY: number;
  readonly turretRotation: number;
  readonly hullRadius: number;
  readonly hulls: readonly number[];
  readonly shells: readonly ProbedShell[];
}

export interface GapSummary {
  readonly count: number;
  readonly median: number;
  readonly p90: number;
}

/** How far the drawn barrel may pass from a shell's birth point and still be its barrel. */
const BARREL_MATCH_UNITS = 40;

export function summarize(values: readonly number[]): GapSummary {
  const sorted = [...values].sort((left, right) => left - right);
  const at = (share: number): number =>
    sorted.length === 0
      ? Number.NaN
      : (sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))] ?? Number.NaN);
  return { count: sorted.length, median: at(0.5), p90: at(0.9) };
}

/** Each shell's first visible frame, skipping shells already in the air when recording began. */
function firstSightings(
  frames: readonly ProbedFrame[],
  own: boolean
): { readonly index: number; readonly shell: ProbedShell }[] {
  const seen = new Set<string>();
  for (const shell of frames[0]?.shells ?? []) seen.add(shell.id);
  const sightings: { index: number; shell: ProbedShell }[] = [];
  frames.forEach((frame, index) => {
    for (const shell of frame.shells) {
      if (shell.own !== own || !shell.visible || seen.has(shell.id)) continue;
      seen.add(shell.id);
      sightings.push({ index, shell });
    }
  });
  return sightings;
}

/**
 * Own shells: distance between where the shell is drawn when it first shows and
 * where it should be if it flew from the drawn barrel on the drawn barrel's
 * clock - its birth point plus its velocity times the wall time since the drawn
 * barrel stood on that point.
 */
export function ownShellGaps(frames: readonly ProbedFrame[]): number[] {
  const gaps: number[] = [];
  for (const { index, shell } of firstSightings(frames, true)) {
    const speed = Math.hypot(shell.velocityX, shell.velocityY);
    if (speed === 0) continue;
    const dirX = shell.velocityX / speed;
    const dirY = shell.velocityY / speed;
    const reach = (frames[index]?.hullRadius ?? 0) + shell.radius;
    let best: { distance: number; time: number } | undefined;
    for (let back = index; back >= 0; back -= 1) {
      const frame = frames[back];
      if (frame === undefined) break;
      const fromCannon = shell.source === "cannon";
      const originX = fromCannon ? frame.mountX : frame.hullX;
      const originY = fromCannon ? frame.mountY : frame.hullY;
      const distance = Math.hypot(
        originX + dirX * reach - shell.birthX,
        originY + dirY * reach - shell.birthY
      );
      if (best === undefined || distance < best.distance) best = { distance, time: frame.time };
    }
    if (best === undefined || best.distance > BARREL_MATCH_UNITS) continue;
    const drawnAt = frames[index];
    if (drawnAt === undefined) continue;
    const elapsed = (drawnAt.time - best.time) / 1000;
    gaps.push(
      Math.hypot(
        shell.x - (shell.birthX + shell.velocityX * elapsed),
        shell.y - (shell.birthY + shell.velocityY * elapsed)
      )
    );
  }
  return gaps;
}

/** Foreign shells: how far outside the nearest drawn hull a shell first shows. */
export function foreignShellGaps(frames: readonly ProbedFrame[]): number[] {
  const gaps: number[] = [];
  for (const { index, shell } of firstSightings(frames, false)) {
    const hulls = frames[index]?.hulls ?? [];
    let nearest = Number.POSITIVE_INFINITY;
    for (let at = 0; at + 2 < hulls.length; at += 3) {
      const distance =
        Math.hypot(shell.x - (hulls[at] ?? 0), shell.y - (hulls[at + 1] ?? 0)) -
        (hulls[at + 2] ?? 0);
      nearest = Math.min(nearest, distance);
    }
    if (Number.isFinite(nearest)) gaps.push(Math.max(0, nearest));
  }
  return gaps;
}

/**
 * Drawn speed over true speed for every visible shell, over windows of at least
 * `WINDOW_MS`. A shell whose clock is being brought to the present flies a
 * little slow or a little fast; the spec bounds by how much.
 *
 * Windowed rather than frame to frame: a clock that advances in whole steps -
 * the device run drew its hull that way until `local-run-hull-smoothness` -
 * moves a shell on one frame in three of a 165 Hz panel, and a per-frame ratio
 * would read that as a stopped shell.
 */
const WINDOW_MS = 50;

export function drawnSpeedRatios(frames: readonly ProbedFrame[]): number[] {
  const ratios: number[] = [];
  const anchor = new Map<string, { x: number; y: number; time: number }>();
  for (const frame of frames) {
    for (const shell of frame.shells) {
      if (!shell.visible) {
        anchor.delete(shell.id);
        continue;
      }
      const from = anchor.get(shell.id);
      if (from === undefined) {
        anchor.set(shell.id, { x: shell.x, y: shell.y, time: frame.time });
        continue;
      }
      const elapsed = frame.time - from.time;
      if (elapsed < WINDOW_MS) continue;
      const speed = Math.hypot(shell.velocityX, shell.velocityY);
      if (speed > 0) {
        ratios.push(Math.hypot(shell.x - from.x, shell.y - from.y) / (speed * (elapsed / 1000)));
      }
      anchor.set(shell.id, { x: shell.x, y: shell.y, time: frame.time });
    }
  }
  return ratios;
}

/**
 * Drains the page's probe for `durationMs` while `act` flies the ship.
 *
 * Drained rather than read once at the end: the page keeps a bounded ring, and
 * on a 165 Hz panel it holds under four seconds.
 */
export async function recordFrames(
  page: Page,
  durationMs: number,
  act: () => Promise<void>
): Promise<ProbedFrame[]> {
  const frames: ProbedFrame[] = [];
  const drain = async (): Promise<void> => {
    const batch = await page.evaluate(() => {
      const probe = (globalThis as { __spaceshipShellProbe?: { frames: unknown[] } })
        .__spaceshipShellProbe;
      return probe === undefined ? null : probe.frames.splice(0);
    });
    if (batch === null) throw new Error("the page publishes no shell probe - is ?diag=1 set?");
    frames.push(...(batch as ProbedFrame[]));
  };
  await drain();
  frames.length = 0;
  const acting = act();
  const until = Date.now() + durationMs;
  while (Date.now() < until) {
    await page.waitForTimeout(400);
    await drain();
  }
  await acting;
  await drain();
  return frames;
}
