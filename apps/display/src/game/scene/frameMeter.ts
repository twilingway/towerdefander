/**
 * How much longer than the shortest frame of the window a frame has to run
 * before it counts as a stutter. Half again: a frame that misses its slot and
 * waits for the next one is a full double, so this catches a dropped frame with
 * room to spare and ignores the ordinary jitter of a busy compositor.
 */
const STUTTER_RATIO = 1.5;
const FRAME_WINDOW_MS = 1000;

/**
 * What the scene knows about its own smoothness, kept apart from what it draws.
 *
 * Three questions, and the first two cannot answer the third between them. The
 * average says whether the scene keeps up; the worst frame says whether it
 * stopped; only the stutter share says whether it was *even*. Thirty frames of
 * 16 ms and thirty of 33 average to a healthy 45 and hide a picture that
 * judders the whole way.
 *
 * The stutter measure calibrates itself: the shortest frame of the window is
 * the display's own cadence - the one figure a stall cannot inflate - so it
 * reads 60 Hz, 120 Hz or a throttled tab without being told which.
 */
export class FrameMeter {
  /** The longest frame of the last completed second, in milliseconds. */
  private worstFrameMs = 0;
  /** Share of the last second's frames that ran long, on `[0, 1]`. */
  private stutterShare = 0;
  /**
   * The average frame of the last second.
   *
   * Beside the worst on purpose: a rate says how many frames arrived, the worst
   * says whether one of them was late, and only the mean says whether the whole
   * second was heavy or one moment in it was.
   */
  private averageFrameMs = 0;
  /** Milliseconds a second the scene spends in its own update, and the worst one. */
  private updateMsPerSecond = 0;
  private worstUpdateMs = 0;

  private windowEndsAt = 0;
  private windowWorstMs = 0;
  private windowUpdateMs = 0;
  private windowWorstUpdateMs = 0;
  private windowFrames = 0;
  private windowStutters = 0;
  private windowShortestMs = Number.POSITIVE_INFINITY;
  private windowTotalMs = 0;

  private liveDrawnCount = 0;
  private offscreenCount = 0;

  /** What the scene spent inside its own update this frame. */
  recordUpdate(spentMs: number): void {
    this.windowUpdateMs += spentMs;
    if (spentMs > this.windowWorstUpdateMs) this.windowWorstUpdateMs = spentMs;
  }

  recordDrawn(liveDrawn: number, offscreen: number): void {
    this.liveDrawnCount = liveDrawn;
    this.offscreenCount = offscreen;
  }

  /**
   * Rolls the window, and publishes only when it closes.
   *
   * The published numbers hold still for a second on purpose: they are read
   * twice a second by a panel, and a figure that changed underneath the sampler
   * would be noise rather than a reading.
   */
  recordFrame(time: number, rawDeltaMs: number): void {
    if (this.windowEndsAt === 0) {
      // The first frame carries boot work no later frame repeats.
      this.windowEndsAt = time + FRAME_WINDOW_MS;
      return;
    }
    if (rawDeltaMs > this.windowWorstMs) this.windowWorstMs = rawDeltaMs;
    this.windowFrames += 1;
    this.windowTotalMs += rawDeltaMs;
    if (rawDeltaMs > 0 && rawDeltaMs < this.windowShortestMs) this.windowShortestMs = rawDeltaMs;
    if (rawDeltaMs > this.windowShortestMs * STUTTER_RATIO) this.windowStutters += 1;
    if (time < this.windowEndsAt) return;

    this.worstFrameMs = this.windowWorstMs;
    this.stutterShare = this.windowFrames > 0 ? this.windowStutters / this.windowFrames : 0;
    this.averageFrameMs = this.windowFrames > 0 ? this.windowTotalMs / this.windowFrames : 0;
    this.updateMsPerSecond = this.windowUpdateMs;
    this.worstUpdateMs = this.windowWorstUpdateMs;

    this.windowUpdateMs = 0;
    this.windowWorstUpdateMs = 0;
    this.windowWorstMs = 0;
    this.windowFrames = 0;
    this.windowTotalMs = 0;
    this.windowStutters = 0;
    this.windowShortestMs = Number.POSITIVE_INFINITY;
    this.windowEndsAt = time + FRAME_WINDOW_MS;
  }

  readAverageFrameMs(): number {
    return this.averageFrameMs;
  }

  readWorstFrameMs(): number {
    return this.worstFrameMs;
  }

  readStutterShare(): number {
    return this.stutterShare;
  }

  readUpdateMsPerSecond(): number {
    return this.updateMsPerSecond;
  }

  readWorstUpdateMs(): number {
    return this.worstUpdateMs;
  }

  readLiveDrawnCount(): number {
    return this.liveDrawnCount;
  }

  readOffscreenCount(): number {
    return this.offscreenCount;
  }
}
