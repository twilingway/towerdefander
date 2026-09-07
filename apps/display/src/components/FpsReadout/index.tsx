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

/**
 * When unevenness is worth naming, and when it is worth alarming about.
 *
 * A tenth of the frames running long is the point where a pan stops looking
 * like motion and starts looking like a slideshow with extra steps; a quarter
 * is a picture nobody would call smooth. Below the first, a stray long frame
 * from a garbage collection is not news.
 */
export const STUTTER_VISIBLE_SHARE = 0.1;
export const STUTTER_ALARM_SHARE = 0.25;

/**
 * Whole percent, always shown.
 *
 * The freeze badge beside it appears only when there is a freeze, because a
 * missing badge there means "nothing stalled" and that is the whole message.
 * Evenness is different: it was asked for as an instrument, and an instrument
 * that hides at zero is indistinguishable from one that was never fitted. A
 * steady 0% is information — it says the picture is even right now.
 */
export function formatStutterShare(share: number): string {
  return Number.isFinite(share) && share > 0 ? String(Math.round(share * 100)) : "0";
}

export function stutterClassName(share: number): string {
  return `frame-stutter${share >= STUTTER_ALARM_SHARE ? " frame-stutter--alarming" : ""}`;
}

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
  worstFrameMs,
  stutterShare = 0
}: {
  readonly fps: number;
  readonly worstFrameMs: number;
  readonly stutterShare?: number;
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
      <span
        className={stutterClassName(stutterShare)}
        data-testid="frame-stutter"
        aria-label="Доля рваных кадров за секунду"
      >
        {" · рывки "}
        <strong>{formatStutterShare(stutterShare)}</strong>%
      </span>
    </span>
  );
}
