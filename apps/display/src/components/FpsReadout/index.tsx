/**
 * Below this the scene is dropping frames badly enough that the player can see
 * it, so the readout says so rather than making them compare numbers.
 */
export const FPS_STRAIN_CEILING = 45;

export function fpsClassName(fps: number): string {
  return `fps-readout${fps > 0 && fps < FPS_STRAIN_CEILING ? " fps-readout--strained" : ""}`;
}

/** Whole frames: a tenth of a frame is noise on a running game. */
export function formatFps(fps: number): string {
  return Number.isFinite(fps) && fps > 0 ? String(Math.round(fps)) : "—";
}

/**
 * Frames a second as the game loop measures them, shown beside the ping: both
 * answer "is this display keeping up", and a player looking for one is looking
 * for the other.
 */
export function FpsReadout({ fps }: { readonly fps: number }) {
  return (
    <span className={fpsClassName(fps)} data-testid="fps-readout" aria-label="Кадров в секунду">
      <strong>{formatFps(fps)}</strong> FPS
    </span>
  );
}
