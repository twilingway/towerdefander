/**
 * How much this connection actually carries, in bytes.
 *
 * The frame counter answers "is the picture keeping up" and the step cost
 * answers "is the server keeping up". Neither answers "what does this cost the
 * wire", and that is the question every culling and quantisation decision ahead
 * of us is really about.
 *
 * What is counted is the payload a page can see. Frame headers are a handful of
 * bytes and the TCP/IP envelope around forty more, and neither is visible from
 * script, so at sixty small packets a second these numbers are a floor rather
 * than the cost on the wire. Said out loud here because a floor read as a total
 * is how a measurement starts lying.
 */

/** The unit the readouts beside it already speak in. */
const WINDOW_MS = 1_000;

export type TrafficDirection = "in" | "out";

export interface TrafficMeter {
  /** Rates of the last completed window, in bytes a second. */
  readonly inPerSecond: number;
  readonly outPerSecond: number;
  /**
   * Messages a second out of this client, over the same window.
   *
   * The number the room's own ceiling is measured against: a client that sends
   * more than it allows is force-closed on the spot, and from the page that
   * looks like the world freezing while a locally predicted ship flies on.
   */
  readonly outMessagesPerSecond: number;
  /** Everything the connection has carried since it opened. */
  readonly totalIn: number;
  readonly totalOut: number;
  /**
   * Undefined until the first reading, rather than zero: `performance.now()` is
   * legitimately zero at the top of a page's life, and a sentinel a real clock
   * can produce is a window that never starts.
   */
  readonly windowStartedAt: number | undefined;
  readonly windowIn: number;
  readonly windowOut: number;
  readonly windowOutMessages: number;
}

export function createTrafficMeter(): TrafficMeter {
  return {
    inPerSecond: 0,
    outPerSecond: 0,
    outMessagesPerSecond: 0,
    totalIn: 0,
    totalOut: 0,
    windowStartedAt: undefined,
    windowIn: 0,
    windowOut: 0,
    windowOutMessages: 0
  };
}

/**
 * Closes the window when it is due, so a quiet connection falls back to zero
 * instead of showing the last busy second forever. Safe to call every frame.
 */
export function advanceTraffic(meter: TrafficMeter, nowMs: number): TrafficMeter {
  if (!Number.isFinite(nowMs)) return meter;
  if (meter.windowStartedAt === undefined) {
    return { ...meter, windowStartedAt: nowMs };
  }
  const elapsed = nowMs - meter.windowStartedAt;
  if (elapsed < WINDOW_MS) return meter;
  // Divided by the time the window actually took, not by the time it was meant
  // to take: a tab that stopped being scheduled would otherwise report several
  // seconds of traffic as though it had arrived in one.
  const perSecond = WINDOW_MS / elapsed;
  return {
    ...meter,
    inPerSecond: meter.windowIn * perSecond,
    outPerSecond: meter.windowOut * perSecond,
    outMessagesPerSecond: meter.windowOutMessages * perSecond,
    windowStartedAt: nowMs,
    windowIn: 0,
    windowOut: 0,
    windowOutMessages: 0
  };
}

export function recordTraffic(
  meter: TrafficMeter,
  direction: TrafficDirection,
  bytes: number,
  nowMs: number
): TrafficMeter {
  const carried = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
  const rolled = advanceTraffic(meter, nowMs);
  if (direction === "in") {
    return carried === 0
      ? rolled
      : { ...rolled, windowIn: rolled.windowIn + carried, totalIn: rolled.totalIn + carried };
  }
  // Counted even when it carried nothing measurable: against a ceiling it is
  // the message that costs, whatever its size.
  return {
    ...rolled,
    windowOut: rolled.windowOut + carried,
    totalOut: rolled.totalOut + carried,
    windowOutMessages: rolled.windowOutMessages + 1
  };
}

/** The half of a socket this probe needs, narrowed from the SDK's transport. */
interface CountableSocket {
  send(data: unknown): void;
  addEventListener(type: "message", listener: (event: { data?: unknown }) => void): void;
  removeEventListener(type: "message", listener: (event: { data?: unknown }) => void): void;
}

export interface TrafficProbe {
  /** Rolls the window and returns the current reading. */
  read(nowMs: number): TrafficMeter;
  detach(): void;
}

function asCountableSocket(value: unknown): CountableSocket | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const candidate = value as Partial<CountableSocket>;
  return typeof candidate.send === "function" &&
    typeof candidate.addEventListener === "function" &&
    typeof candidate.removeEventListener === "function"
    ? (candidate as CountableSocket)
    : undefined;
}

/** Only what a page can weigh; anything else counts as nothing rather than as a guess. */
function byteLength(data: unknown): number {
  if (data instanceof ArrayBuffer) return data.byteLength;
  if (ArrayBuffer.isView(data)) return data.byteLength;
  if (typeof Blob !== "undefined" && data instanceof Blob) return data.size;
  if (typeof data === "string") return data.length;
  return 0;
}

/**
 * Hooks the live socket of a room. Returns undefined when there is no socket to
 * hook, because a counter that quietly reports zero is worse than no counter:
 * zero is indistinguishable from a silent connection.
 *
 * Patching the global `WebSocket` instead would count nothing at all - the SDK
 * resolves the constructor at module scope, and imports run before any statement
 * on the page.
 */
export function attachTrafficMeter(
  socketOf: () => unknown,
  nowMs: () => number
): TrafficProbe | undefined {
  let hooked: CountableSocket | undefined;
  let nativeSend: ((data: unknown) => void) | undefined;
  let meter = createTrafficMeter();

  const onMessage = (event: { data?: unknown }): void => {
    meter = recordTraffic(meter, "in", byteLength(event.data), nowMs());
  };

  const unhook = (): void => {
    if (hooked === undefined) return;
    hooked.removeEventListener("message", onMessage);
    // Drop the shadow rather than assign the original back, so the prototype's
    // own method is what answers again.
    delete (hooked as Partial<CountableSocket>).send;
    hooked = undefined;
    nativeSend = undefined;
  };

  const hook = (socket: CountableSocket): void => {
    unhook();
    hooked = socket;
    nativeSend = socket.send.bind(socket);
    socket.addEventListener("message", onMessage);
    socket.send = (data: unknown): void => {
      meter = recordTraffic(meter, "out", byteLength(data), nowMs());
      nativeSend?.(data);
    };
  };

  const current = asCountableSocket(socketOf());
  if (current === undefined) return undefined;
  hook(current);

  return {
    read(now: number): TrafficMeter {
      // A reconnect builds a new socket, and the shadow stayed on the old one.
      const live = asCountableSocket(socketOf());
      if (live !== undefined && live !== hooked) hook(live);
      meter = advanceTraffic(meter, now);
      return meter;
    },
    detach: unhook
  };
}
