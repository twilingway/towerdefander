/**
 * Work that blocked the page for long enough to cost a frame.
 *
 * The instrument that closes the last gap in the ledger. A phone showed a worst
 * frame of thirty-three milliseconds while the scene owned three of them and
 * React eight - so twenty went somewhere neither meter looks. A long task says
 * whether that somewhere is script at all: counted here, it is ours to fix;
 * absent, the frame went into painting and compositing, and no amount of
 * cheaper JavaScript will touch it.
 *
 * The browser reports anything over fifty milliseconds under the `longtask`
 * entry type; where it is not supported the reading says so rather than showing
 * a confident zero.
 */

export interface LongTaskMeter {
  /** Undefined where the browser has no long-task observer, never zero. */
  readonly supported: boolean;
  readonly perSecond: number;
  readonly worstMs: number;
}

export interface LongTaskProbe {
  read(nowMs: number): LongTaskMeter;
  detach(): void;
}

interface ObservedEntry {
  readonly duration: number;
}

interface EntryList {
  getEntries(): readonly ObservedEntry[];
}

interface Observer {
  observe(options: { type: string; buffered: boolean }): void;
  disconnect(): void;
}

type ObserverConstructor = new (callback: (list: EntryList) => void) => Observer;

/**
 * Starts watching, or reports that this browser cannot.
 *
 * `now` is injected for the same reason the traffic probe injects it: a meter
 * that reads the clock itself cannot be tested without one.
 */
export function attachLongTaskMeter(now: () => number): LongTaskProbe {
  const constructor = (globalThis as { PerformanceObserver?: ObserverConstructor })
    .PerformanceObserver;
  let count = 0;
  let worstMs = 0;
  let windowStartedAt = now();

  if (constructor === undefined) {
    return {
      read: () => ({ supported: false, perSecond: 0, worstMs: 0 }),
      detach: () => undefined
    };
  }

  let observer: Observer;
  try {
    observer = new constructor((list) => {
      for (const entry of list.getEntries()) {
        count += 1;
        if (entry.duration > worstMs) worstMs = entry.duration;
      }
    });
    observer.observe({ type: "longtask", buffered: true });
  } catch {
    // Safari and every browser without the entry type land here: an instrument
    // that cannot measure has to say so.
    return {
      read: () => ({ supported: false, perSecond: 0, worstMs: 0 }),
      detach: () => undefined
    };
  }

  return {
    read: (nowMs: number) => {
      const elapsed = Math.max(1, nowMs - windowStartedAt);
      const reading = {
        supported: true,
        perSecond: (count * 1000) / elapsed,
        worstMs
      };
      windowStartedAt = nowMs;
      count = 0;
      worstMs = 0;
      return reading;
    },
    detach: () => {
      observer.disconnect();
    }
  };
}
