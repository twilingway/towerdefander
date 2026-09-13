import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AudioBus } from "./AudioBus.js";

/** A context that starts only on a gesture the page's browser accepts. */
class FakeAudioContext {
  static gestureAccepted = false;
  state: AudioContextState = "suspended";
  readonly destination = {};

  createGain() {
    return { gain: { value: 1 }, connect: () => undefined, disconnect: () => undefined };
  }

  resume(): Promise<void> {
    if (FakeAudioContext.gestureAccepted) this.state = "running";
    return Promise.resolve();
  }

  decodeAudioData(): Promise<never> {
    return Promise.reject(new Error("There is no audio in a test."));
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}

describe("the audio unlock", () => {
  const listeners = new Map<string, Set<() => void>>();

  const dispatch = (type: string): void => {
    for (const listener of [...(listeners.get(type) ?? [])]) listener();
  };
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const stateOf = (bus: AudioBus) =>
    (bus as unknown as { context?: { state: AudioContextState } }).context?.state;

  beforeEach(() => {
    vi.stubGlobal("document", {
      addEventListener: (type: string, listener: () => void) => {
        const set = listeners.get(type) ?? new Set<() => void>();
        set.add(listener);
        listeners.set(type, set);
      },
      removeEventListener: (type: string, listener: () => void) => {
        listeners.get(type)?.delete(listener);
      }
    });
    vi.stubGlobal("AudioContext", FakeAudioContext);
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("offline")))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    listeners.clear();
    FakeAudioContext.gestureAccepted = false;
  });

  it("keeps listening past a touch the browser refused, and starts on the gesture after it", async () => {
    const bus = new AudioBus();

    // A finger's pointerdown, which a phone's browser does not count as a gesture.
    dispatch("pointerdown");
    await settle();
    expect(stateOf(bus)).toBe("suspended");

    // The pointerup that ends the same touch, which it does.
    FakeAudioContext.gestureAccepted = true;
    dispatch("pointerup");
    await settle();
    expect(stateOf(bus)).toBe("running");
    bus.destroy();
  });

  it("stops listening once the sound is running", async () => {
    FakeAudioContext.gestureAccepted = true;
    const bus = new AudioBus();

    dispatch("click");
    await settle();

    expect(stateOf(bus)).toBe("running");
    expect([...listeners.values()].every((set) => set.size === 0)).toBe(true);
    bus.destroy();
  });
});
