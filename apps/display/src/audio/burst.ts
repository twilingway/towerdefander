import { SOUND_SHAPES, type SoundShape } from "@spaceship-defender/audio-assets";

/** A weapon that has not fired for this long has let go of the trigger. */
const RELEASE_FACTOR = 2;
const RELEASE_FLOOR_MS = 90;
/** Two shots further apart than this are two bursts, not one. */
const MAX_GAP_MS = 600;
const MIN_GAP_MS = 20;
/** How far a sample may be stretched before it stops sounding like itself. */
const MIN_RATE = 0.6;
const MAX_RATE = 1.8;

export interface BurstStart {
  /** Playback rate that puts the recorded cadence on the weapon's own. */
  readonly rate: number;
}

export interface BurstTracker {
  /**
   * One shot happened. Returns how to start the sample, or null when the copy
   * already playing still covers this shot.
   */
  shot: (id: string, nowMs: number, shape?: SoundShape) => BurstStart | null;
  /** Ids whose burst has outlived the trigger, for the caller to stop. */
  settle: (nowMs: number) => readonly string[];
}

interface Running {
  firedInBurst: number;
  lastShotAt: number;
  gapMs: number;
  playing: boolean;
}

/**
 * Keeps a burst sample in step with the gun that is firing.
 *
 * Two problems, one answer. A three-second recording of eight rounds started
 * again on every trigger pull is eight overlapping bursts, which is mush; and
 * the recording's own rate of fire is whatever the day it was recorded, which
 * will not be the weapon's once that is something a crew upgrades.
 *
 * So the sample is started once per the number of rounds it contains, and
 * stretched by the ratio between its recorded spacing and the spacing actually
 * being fired. A single-shot sample - a cannon, an explosion - has one round in
 * it, so this degenerates to "play it every time, unstretched", which is what
 * it should be.
 *
 * Per id rather than per ship on purpose: sixteen hulls firing the same weapon
 * are one stream of fire to a listener, and sixteen streams of it is the wall
 * of noise the whole audio layer is arranged to avoid.
 */
export function createBurstTracker(): BurstTracker {
  const running = new Map<string, Running>();
  return {
    shot(id, nowMs, shape = SOUND_SHAPES[id]) {
      const rounds = Math.max(1, shape?.shots ?? 1);
      const state = running.get(id);
      const sinceLast = state === undefined ? Number.POSITIVE_INFINITY : nowMs - state.lastShotAt;
      const fresh = state === undefined || !state.playing || sinceLast > MAX_GAP_MS;

      if (rounds === 1) {
        running.set(id, { firedInBurst: 1, lastShotAt: nowMs, gapMs: MAX_GAP_MS, playing: false });
        return { rate: 1 };
      }

      if (!fresh && state.firedInBurst < rounds) {
        state.firedInBurst += 1;
        // The first pair of a burst is what says how fast this one is going;
        // later pairs only confirm it, and a jittery frame must not re-pitch a
        // sample that is already sounding.
        if (state.firedInBurst === 2) state.gapMs = clampGap(sinceLast);
        state.lastShotAt = nowMs;
        return null;
      }

      const gapMs = fresh
        ? (state?.gapMs ?? clampGap(shape?.shotGapMs ?? MAX_GAP_MS))
        : clampGap(sinceLast);
      running.set(id, { firedInBurst: 1, lastShotAt: nowMs, gapMs, playing: true });
      const recorded = shape?.shotGapMs ?? gapMs;
      return { rate: clampRate(recorded / gapMs) };
    },

    settle(nowMs) {
      const released: string[] = [];
      for (const [id, state] of running) {
        if (!state.playing) continue;
        if (nowMs - state.lastShotAt <= state.gapMs * RELEASE_FACTOR + RELEASE_FLOOR_MS) continue;
        state.playing = false;
        released.push(id);
      }
      return released;
    }
  };
}

function clampGap(gapMs: number): number {
  if (!Number.isFinite(gapMs)) return MAX_GAP_MS;
  return Math.min(MAX_GAP_MS, Math.max(MIN_GAP_MS, gapMs));
}

function clampRate(rate: number): number {
  if (!Number.isFinite(rate) || rate <= 0) return 1;
  return Math.min(MAX_RATE, Math.max(MIN_RATE, rate));
}
