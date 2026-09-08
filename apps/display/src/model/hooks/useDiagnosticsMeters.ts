import { useEffect } from "react";

import { advanceInstruments, setLongTaskMeter, setTrafficMeter } from "../instruments.js";
import { attachLongTaskMeter } from "../longTasks.js";
import { attachTrafficMeter } from "../trafficMeter.js";

export interface DiagnosticsMeterOptions {
  readonly enabled: boolean;
  /** The live socket, re-read as connections come and go. */
  readonly readSocket: () => unknown;
  /** A whole new room arrives here; the probe follows a reconnect on its own. */
  readonly connectionEpoch: number;
  readonly status: string;
}

/**
 * The two meters that only run when the panel was asked for: the work windows
 * and the byte counter.
 *
 * There is no state in either on purpose. A sample that re-rendered the page
 * would be an instrument paying for itself four times a second, and the panel
 * pulls these on its own beat.
 */
export function useDiagnosticsMeters({
  enabled,
  readSocket,
  connectionEpoch,
  status
}: DiagnosticsMeterOptions): void {
  /* The snapshot cost is published on its own beat, so it is shown even when the
     byte counter could not attach to a socket. */
  useEffect(() => {
    if (!enabled) return undefined;
    const longTasks = attachLongTaskMeter(() => performance.now());
    const timer = window.setInterval(() => {
      const now = performance.now();
      advanceInstruments(now);
      setLongTaskMeter(longTasks.read(now));
    }, 500);
    return () => {
      window.clearInterval(timer);
      longTasks.detach();
    };
  }, [enabled]);

  /*
   * The byte counter hooks the live socket rather than the SDK, so it has to be
   * re-read as connections come and go - the probe follows the socket across a
   * reconnect on its own, and the connection epoch is what brings a whole new
   * room here.
   */
  useEffect(() => {
    if (!enabled) return undefined;
    const probe = attachTrafficMeter(readSocket, () => performance.now());

    if (probe === undefined) {
      // Undefined stands for "never attached", which the panel says in words.
      setTrafficMeter(undefined);
      return undefined;
    }
    // Twice a second: the numbers are read, not watched, and a byte counter
    // driving a React render at frame rate would be an instrument that costs
    // the very thing it measures.
    const timer = window.setInterval(() => {
      setTrafficMeter(probe.read(performance.now()));
    }, 500);
    return () => {
      window.clearInterval(timer);
      probe.detach();
    };
    // The epoch and the status are what bring a new socket here; readSocket
    // reads through a ref and never changes what it points at.
  }, [enabled, connectionEpoch, status]);
}
