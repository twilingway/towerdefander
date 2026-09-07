import { describe, expect, it } from "vitest";

import {
  advanceTraffic,
  attachTrafficMeter,
  createTrafficMeter,
  recordTraffic,
  type TrafficMeter
} from "./trafficMeter.js";

/** Feeds one direction repeatedly, holding the clock where the caller says. */
function carry(
  meter: TrafficMeter,
  direction: "in" | "out",
  bytes: number,
  nowMs: number,
  times = 1
): TrafficMeter {
  let next = meter;
  for (let index = 0; index < times; index += 1) {
    next = recordTraffic(next, direction, bytes, nowMs);
  }
  return next;
}

describe("trafficMeter", () => {
  it("accumulates totals before the first window closes", () => {
    let meter = advanceTraffic(createTrafficMeter(), 1_000);
    meter = carry(meter, "in", 120, 1_100, 3);
    meter = carry(meter, "out", 40, 1_200, 2);

    expect(meter.totalIn).toBe(360);
    expect(meter.totalOut).toBe(80);
    // Nothing is claimed about a rate until a window has actually elapsed.
    expect(meter.inPerSecond).toBe(0);
    expect(meter.outPerSecond).toBe(0);
  });

  it("publishes the closed window as a rate", () => {
    let meter = advanceTraffic(createTrafficMeter(), 1_000);
    meter = carry(meter, "in", 500, 1_400, 2);
    meter = carry(meter, "out", 100, 1_500);

    meter = advanceTraffic(meter, 2_000);

    expect(meter.inPerSecond).toBe(1_000);
    expect(meter.outPerSecond).toBe(100);
    expect(meter.totalIn).toBe(1_000);
    expect(meter.totalOut).toBe(100);
  });

  it("falls back to zero over a quiet second instead of holding the busy one", () => {
    let meter = advanceTraffic(createTrafficMeter(), 0);
    meter = carry(meter, "in", 800, 500);
    meter = advanceTraffic(meter, 1_000);
    expect(meter.inPerSecond).toBe(800);

    meter = advanceTraffic(meter, 2_000);

    expect(meter.inPerSecond).toBe(0);
    // The session total is not a rate and never decays.
    expect(meter.totalIn).toBe(800);
  });

  it("divides by the window that happened, not the one that was asked for", () => {
    let meter = advanceTraffic(createTrafficMeter(), 0);
    meter = carry(meter, "in", 3_000, 100);

    // The tab stopped being scheduled: four seconds of wall clock, one window.
    meter = advanceTraffic(meter, 4_000);

    // 3000 bytes over four seconds is 750 a second, not 3000.
    expect(meter.inPerSecond).toBe(750);
  });

  it("ignores a reading that is not a positive number of bytes", () => {
    let meter = advanceTraffic(createTrafficMeter(), 0);

    meter = recordTraffic(meter, "in", Number.NaN, 100);
    meter = recordTraffic(meter, "in", -20, 200);
    meter = recordTraffic(meter, "out", Number.POSITIVE_INFINITY, 300);

    expect(meter.totalIn).toBe(0);
    expect(meter.totalOut).toBe(0);
  });
});

/**
 * `send` lives on the prototype, exactly as a real socket's does, so the probe's
 * own-property shadow and its removal are exercised rather than simulated.
 */
class FakeSocket {
  readonly sent: unknown[] = [];
  private listeners: ((event: { data?: unknown }) => void)[] = [];

  send(data: unknown): void {
    this.sent.push(data);
  }

  addEventListener(_type: "message", listener: (event: { data?: unknown }) => void): void {
    this.listeners.push(listener);
  }

  removeEventListener(_type: "message", listener: (event: { data?: unknown }) => void): void {
    this.listeners = this.listeners.filter((entry) => entry !== listener);
  }

  receive(data: unknown): void {
    this.listeners.forEach((listener) => {
      listener({ data });
    });
  }
}

describe("attachTrafficMeter", () => {
  it("says it could not attach instead of reporting zero", () => {
    expect(
      attachTrafficMeter(
        () => undefined,
        () => 0
      )
    ).toBeUndefined();
    expect(
      attachTrafficMeter(
        () => ({}),
        () => 0
      )
    ).toBeUndefined();
  });

  it("counts both directions and still delivers what was sent", () => {
    const socket = new FakeSocket();
    let now = 0;
    const probe = attachTrafficMeter(
      () => socket,
      () => now
    );
    if (probe === undefined) throw new Error("Expected the probe to attach.");

    socket.receive(new Uint8Array(120));
    socket.send(new Uint8Array(30));
    now = 1_000;

    const reading = probe.read(now);
    expect(reading.totalIn).toBe(120);
    expect(reading.totalOut).toBe(30);
    // The shadow forwards: shadowing a socket that then stops sending would be
    // a diagnostic that breaks the game it measures.
    expect(socket.sent).toHaveLength(1);
  });

  it("follows the connection onto a new socket after a reconnect", () => {
    const first = new FakeSocket();
    const second = new FakeSocket();
    let live: FakeSocket = first;
    const probe = attachTrafficMeter(
      () => live,
      () => 0
    );
    if (probe === undefined) throw new Error("Expected the probe to attach.");
    first.receive(new Uint8Array(10));

    live = second;
    probe.read(0);
    second.receive(new Uint8Array(5));
    second.send(new Uint8Array(7));

    const reading = probe.read(0);
    expect(reading.totalIn).toBe(15);
    expect(reading.totalOut).toBe(7);
    expect(second.sent).toHaveLength(1);
  });

  it("stops counting and gives the socket its own send back on detach", () => {
    const socket = new FakeSocket();
    const probe = attachTrafficMeter(
      () => socket,
      () => 0
    );
    if (probe === undefined) throw new Error("Expected the probe to attach.");
    socket.receive(new Uint8Array(10));

    probe.detach();
    socket.receive(new Uint8Array(999));
    socket.send(new Uint8Array(999));

    expect(Object.hasOwn(socket, "send")).toBe(false);
    expect(socket.sent).toHaveLength(1);
  });
});
