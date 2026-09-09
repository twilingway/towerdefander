import type { ReactElement } from "react";
import type { FxEffect } from "@spaceship-defender/fx-assets";

import { spriteFrameStyle } from "./fxSprite.js";

/** A still from a third of the way in, where a burst is at its widest. */
const THUMBNAIL_SCALE = 0.6;

/**
 * One effect slot: what it plays, and what a frame of it looks like.
 *
 * A select rather than the searchable grid the silhouettes use. There are a
 * handful of effects to choose from and a search box over four rows is noise -
 * the thumbnail is what actually answers "which one is that". Shared because
 * two screens now hang effects on things: an enemy archetype on its events, and
 * a hull on its shield.
 */
export function EffectSlotRow({
  slot,
  caption,
  hint,
  choices,
  chosen,
  testIdPrefix,
  onChange
}: {
  readonly slot: string;
  readonly caption: string;
  /** What an empty choice means here, said in the operator's words. */
  readonly hint: string;
  readonly choices: readonly FxEffect[];
  readonly chosen: string;
  readonly testIdPrefix: string;
  readonly onChange: (value: string) => void;
}): ReactElement {
  const effect = choices.find((candidate) => candidate.id === chosen);
  return (
    <div className="fx-slots__row">
      <label className="field">
        <span className="field__caption">{caption}</span>
        <select
          data-testid={`${testIdPrefix}-${slot}`}
          onChange={(event) => {
            onChange(event.target.value);
          }}
          value={chosen}
        >
          <option value="">как сейчас</option>
          {choices.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.title}
            </option>
          ))}
        </select>
      </label>
      {effect === undefined ? (
        <span className="fx-slots__hint">{hint}</span>
      ) : (
        <span
          className="fx-card__thumb"
          data-testid={`${testIdPrefix}-thumb-${slot}`}
          style={spriteFrameStyle(effect, Math.floor(effect.meta.frames / 3), THUMBNAIL_SCALE)}
        />
      )}
    </div>
  );
}
