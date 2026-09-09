import { useEffect, useRef, useState, type ReactElement } from "react";
import { FX_CATEGORY_LABELS, type FxEffect } from "@spaceship-defender/fx-assets";

import { formatBytes, frameForElapsed, spriteFrameStyle } from "./playback.js";

/** Big enough to judge a plume against the arena's own scale. */
const PREVIEW_SCALE = 2;

/**
 * The selected effect, playing. Stepping a background offset is the whole
 * animation: the sheet is one already-decoded image, so a frame costs a style
 * write and nothing else.
 */
export function EffectPreview({ effect }: { readonly effect: FxEffect }): ReactElement {
  const [playing, setPlaying] = useState(true);
  const [frame, setFrame] = useState(0);
  // A ref, not state: the loop reads it every animation frame and must not
  // restart itself for each new value.
  const startedAt = useRef(0);

  useEffect(() => {
    setFrame(0);
    if (!playing) return undefined;
    let raf = 0;
    startedAt.current = performance.now();
    const step = (now: number): void => {
      setFrame(frameForElapsed(effect, (now - startedAt.current) / 1000));
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
    };
    // The effect's identity is what restarts playback; its fields never change
    // under us, since the manifest is generated at build time.
  }, [effect, playing]);

  const meta = effect.meta;
  return (
    <section className="fx-preview" data-testid="fx-preview">
      <header className="fx-preview__header">
        <h3>{effect.title}</h3>
        <p className="screen__hint">{effect.hint}</p>
      </header>
      <div className="fx-preview__stage">
        <div
          className="fx-preview__frame"
          data-testid="fx-preview-frame"
          style={spriteFrameStyle(effect, frame, PREVIEW_SCALE)}
        />
      </div>
      <div className="fx-preview__controls">
        <button
          className="fx-preview__play"
          data-testid="fx-preview-play"
          onClick={() => {
            setPlaying((was) => !was);
          }}
          type="button"
        >
          {playing ? "Пауза" : "Играть"}
        </button>
        <input
          aria-label="Кадр"
          className="fx-preview__scrub"
          disabled={playing}
          max={meta.frames - 1}
          min={0}
          onChange={(event) => {
            setFrame(Number(event.target.value));
          }}
          step={1}
          type="range"
          value={frame}
        />
        <span className="fx-preview__counter">
          {frame + 1} / {meta.frames}
        </span>
      </div>
      <dl className="fx-preview__meta">
        <dt>Категория</dt>
        <dd>{FX_CATEGORY_LABELS[effect.category]}</dd>
        <dt>Кадр</dt>
        <dd>
          {meta.frameWidth}×{meta.frameHeight}
        </dd>
        <dt>Сетка</dt>
        <dd>
          {meta.cols}×{meta.rows}, кадров {meta.frames}
        </dd>
        <dt>Темп</dt>
        <dd>
          {meta.fps} fps, {meta.duration} с
        </dd>
        <dt>Атлас</dt>
        <dd>{formatBytes(effect.bytes)}</dd>
        <dt>Поведение</dt>
        <dd>
          {effect.loop ? "луп" : "однократный"}
          {effect.oriented ? ", направленный (в атласе — вверх)" : ", круговой"}
        </dd>
      </dl>
    </section>
  );
}
