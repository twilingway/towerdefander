/**
 * Below this the scene is dropping frames badly enough that the player can see
 * it, so the readout says so rather than making them compare numbers.
 */
export const FPS_STRAIN_CEILING = 45;

/**
 * How long a single frame has to take before it is worth naming, and before it
 * is worth alarming about.
 *
 * A freeze and a low frame rate are different complaints. The average above
 * answers "is the scene keeping up"; it cannot answer "did it stop", because
 * one frame of two hundred milliseconds inside a good second barely moves it.
 * Fifty is three frames at sixty hertz - the shortest stall a hand actually
 * feels - and a hundred is one nobody misses.
 */
export const FREEZE_VISIBLE_MS = 50;
export const FREEZE_ALARM_MS = 100;

export function fpsClassName(fps: number): string {
  return `fps-readout${fps > 0 && fps < FPS_STRAIN_CEILING ? " fps-readout--strained" : ""}`;
}

/** Whole frames: a tenth of a frame is noise on a running game. */
export function formatFps(fps: number): string {
  return Number.isFinite(fps) && fps > 0 ? String(Math.round(fps)) : "—";
}

/**
 * Whole milliseconds, and nothing at all while the worst frame of the last
 * second was one the scene was always going to draw. The badge stays a frame
 * counter until there is something to say.
 */
export function formatFrameSpike(worstFrameMs: number): string | undefined {
  if (!Number.isFinite(worstFrameMs) || worstFrameMs < FREEZE_VISIBLE_MS) return undefined;
  return String(Math.round(worstFrameMs));
}

export function frameSpikeClassName(worstFrameMs: number): string {
  return `frame-spike${worstFrameMs >= FREEZE_ALARM_MS ? " frame-spike--alarming" : ""}`;
}

/**
 * Frames a second as the game loop measures them, shown beside the ping: both
 * answer "is this display keeping up", and a player looking for one is looking
 * for the other. Beside it, when there is one, the longest single frame of the
 * last second - the average cannot show a stall, and a stall is what gets
 * called a freeze.
 */
export function FpsReadout({
  fps,
  worstFrameMs
}: {
  readonly fps: number;
  readonly worstFrameMs: number;
}) {
  const spike = formatFrameSpike(worstFrameMs);
  return (
    <span className={fpsClassName(fps)} data-testid="fps-readout" aria-label="Кадров в секунду">
      <strong data-testid="fps-value">{formatFps(fps)}</strong> FPS
      {spike !== undefined && (
        <span
          className={frameSpikeClassName(worstFrameMs)}
          data-testid="frame-spike"
          aria-label="Худший кадр за секунду"
        >
          {" · "}
          <strong>{spike}</strong> мс
        </span>
      )}
    </span>
  );
}
