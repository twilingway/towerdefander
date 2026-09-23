/**
 * The frames the arena is drawn in, announced to whatever else writes to the
 * screen.
 *
 * Every write to the page - a gauge, the radar's canvas, a panel - makes the
 * browser compose a new frame, and on a weak phone composing the HUD's layers
 * costs the GPU about as much as the arena does. When the scene is held to 30
 * fps, a HUD that writes on its own clocks dirties the refreshes in between,
 * and the draws queue behind those compositions: on a Redmi 4X a sixth of the
 * draws slipped to 50 ms, and with the HUD hidden none did. So the writers that
 * change every moment wait for the scene's frame and write in it, and the
 * refresh the cap leaves free stays free.
 *
 * A scene that is not drawing - still loading, or resting under the result
 * screen - announces nothing, and the writers fall back to their own clocks;
 * `sceneFramesFlowing` is how they tell.
 */

type SceneFrameListener = (now: number) => void;

const listeners = new Set<SceneFrameListener>();
let lastAnnouncedAt = Number.NEGATIVE_INFINITY;

/** Longer than a 30 fps frame with a slip or two in it. */
const STALE_AFTER_MS = 150;

/** Called by the runtime at the top of every frame it draws. */
export function announceSceneFrame(now: number): void {
  lastAnnouncedAt = performance.now();
  for (const listener of listeners) listener(now);
}

export function onSceneFrame(listener: SceneFrameListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Whether the scene is drawing, so a writer should wait for its frames. */
export function sceneFramesFlowing(now = performance.now()): boolean {
  return now - lastAnnouncedAt < STALE_AFTER_MS;
}
