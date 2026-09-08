import { useRef } from "react";
import type { DisplayRoomView } from "@spaceship-defender/protocol";

import { hasImmediateChange, needsRootRender, PASSIVE_PUBLISH_MS } from "../viewPublishing.js";

export interface ViewPublisher {
  /** A fresh view from the room; the publisher decides when React hears of it. */
  readonly offer: (view: DisplayRoomView, now: number) => void;
  /** The room is gone: forget what was last published. */
  readonly reset: () => void;
}

/**
 * The page commits on its own clock.
 *
 * Anything a hand is waiting for goes straight through; the rest coalesces,
 * because a tree rebuilt twenty times a second cost a phone seventy
 * milliseconds of every one, in commits whose worst was half a frame - and the
 * numbers in it are not readable at that rate anyway.
 */
export function useViewPublisher(
  onRootView: (view: DisplayRoomView | undefined) => void,
  readLatest: () => DisplayRoomView | undefined
): ViewPublisher {
  const publishedViewReference = useRef<DisplayRoomView | undefined>(undefined);
  const publishedAtReference = useRef(0);
  const publishTimerReference = useRef<number | undefined>(undefined);

  /**
   * Hands a view to React, and remembers when.
   *
   * Separate from deciding whether to: the trailing timer has to run the same
   * publish the patch would have run.
   */
  function publish(view: DisplayRoomView, now: number): void {
    if (publishTimerReference.current !== undefined) {
      window.clearTimeout(publishTimerReference.current);
      publishTimerReference.current = undefined;
    }
    const rootFollows = needsRootRender(publishedViewReference.current, view);
    publishedViewReference.current = view;
    publishedAtReference.current = now;
    // The panels already have it; the tree above them re-renders only when the
    // shape of the page changed.
    if (rootFollows) onRootView(view);
  }

  function offer(view: DisplayRoomView, now: number): void {
    if (hasImmediateChange(publishedViewReference.current, view)) {
      publish(view, now);
      return;
    }
    const due = publishedAtReference.current + PASSIVE_PUBLISH_MS - now;
    if (due <= 0) {
      publish(view, now);
      return;
    }
    // Nothing is dropped: the last state always lands, just later.
    if (publishTimerReference.current !== undefined) return;
    publishTimerReference.current = window.setTimeout(() => {
      publishTimerReference.current = undefined;
      const latest = readLatest();
      if (latest !== undefined) publish(latest, performance.now());
    }, due);
  }

  function reset(): void {
    publishedViewReference.current = undefined;
    onRootView(undefined);
  }

  return { offer, reset };
}
