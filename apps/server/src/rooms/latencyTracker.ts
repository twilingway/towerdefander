import { median } from "./statistics.js";

export interface RoomTimer {
  clear(): void;
}

interface OutstandingLatencyProbe {
  readonly probeId: string;
  readonly sentAt: number;
  readonly timeout: RoomTimer;
}

export const LATENCY_PROBE_INTERVAL_MS = 2_000;
export const LATENCY_PROBE_TIMEOUT_MS = 5_000;
const MAX_LATENCY_SAMPLE_MS = 5_000;
const MAX_LATENCY_SAMPLES = 5;

/** Everything the tracker needs from the room, and nothing about Colyseus. */
export interface LatencyTrackerOptions {
  readonly sendProbe: (sessionId: string, probeId: string) => void;
  readonly schedule: (callback: () => void, delayMs: number) => RoomTimer;
  readonly publish: (sessionId: string, latencyMs: number) => void;
  readonly now: () => number;
}

/**
 * Ping-pong bookkeeping for one room: an outstanding probe per connection, a
 * short history of round trips, and the timers that keep both honest. Split from
 * the room so its lifecycle code is not interleaved with sample maths.
 */
export class LatencyTracker {
  private readonly sessions = new Set<string>();
  private readonly samples = new Map<string, number[]>();
  private readonly outstanding = new Map<string, OutstandingLatencyProbe>();
  private readonly scheduled = new Map<string, RoomTimer>();
  private nextProbeSequence = 1;

  constructor(private readonly options: LatencyTrackerOptions) {}

  /** The probe still awaiting an answer, for tests and diagnostics. */
  pendingProbe(
    sessionId: string
  ): { readonly probeId: string; readonly sentAt: number } | undefined {
    const pending = this.outstanding.get(sessionId);
    return pending === undefined ? undefined : { probeId: pending.probeId, sentAt: pending.sentAt };
  }

  has(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  /** A fresh connection starts at "unknown" and is probed immediately. */
  register(sessionId: string): void {
    this.clear(sessionId);
    this.sessions.add(sessionId);
    this.options.publish(sessionId, -1);
    this.probe(sessionId);
  }

  probe(sessionId: string): void {
    if (!this.sessions.has(sessionId)) return;
    const probeId = `latency-${String(this.nextProbeSequence)}`;
    this.nextProbeSequence += 1;
    const sentAt = this.options.now();
    this.options.sendProbe(sessionId, probeId);
    const timeout = this.options.schedule(() => {
      const pending = this.outstanding.get(sessionId);
      if (pending?.probeId !== probeId) return;
      this.outstanding.delete(sessionId);
      // A silent connection reads as unknown rather than as its last good number.
      this.options.publish(sessionId, -1);
      this.probe(sessionId);
    }, LATENCY_PROBE_TIMEOUT_MS);
    this.outstanding.set(sessionId, { probeId, sentAt, timeout });
  }

  /** Returns false when the pong does not answer the probe still in flight. */
  acceptPong(sessionId: string, probeId: string, receivedAt: number): boolean {
    const pending = this.outstanding.get(sessionId);
    if (pending?.probeId !== probeId) return false;

    pending.timeout.clear();
    this.outstanding.delete(sessionId);
    const roundTripTimeMs = Math.round(
      Math.min(MAX_LATENCY_SAMPLE_MS, Math.max(0, receivedAt - pending.sentAt))
    );
    const samples = [...(this.samples.get(sessionId) ?? []), roundTripTimeMs].slice(
      -MAX_LATENCY_SAMPLES
    );
    this.samples.set(sessionId, samples);
    this.options.publish(sessionId, median(samples));
    this.scheduleProbe(sessionId, LATENCY_PROBE_INTERVAL_MS);
    return true;
  }

  clear(sessionId: string): void {
    this.scheduled.get(sessionId)?.clear();
    this.scheduled.delete(sessionId);
    this.outstanding.get(sessionId)?.timeout.clear();
    this.outstanding.delete(sessionId);
    this.samples.delete(sessionId);
    this.sessions.delete(sessionId);
    this.options.publish(sessionId, -1);
  }

  /** Drops every timer without publishing; the caller resets the state itself. */
  clearAll(): void {
    for (const timer of this.scheduled.values()) timer.clear();
    for (const probe of this.outstanding.values()) probe.timeout.clear();
    this.scheduled.clear();
    this.outstanding.clear();
    this.samples.clear();
    this.sessions.clear();
  }

  private scheduleProbe(sessionId: string, delayMs: number): void {
    this.scheduled.get(sessionId)?.clear();
    const timer = this.options.schedule(() => {
      this.scheduled.delete(sessionId);
      this.probe(sessionId);
    }, delayMs);
    this.scheduled.set(sessionId, timer);
  }
}
