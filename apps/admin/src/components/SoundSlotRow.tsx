import type { ReactElement } from "react";
import { SOUND_IDS, SOUND_LABELS, type SoundId } from "@spaceship-defender/protocol";

import { playPreview } from "./soundPreview.js";

/**
 * One sound slot, with the thing an effect slot cannot have: a way to hear it.
 *
 * A thumbnail answers "which effect is that" at a glance; a file name answers
 * nothing at all about a sound. So every slot carries its own play button, and
 * the strip below the slots lets the whole catalogue be auditioned before
 * anything is assigned - which is the order the choice is actually made in.
 */
export function SoundSlotRow({
  slot,
  caption,
  hint,
  chosen,
  testIdPrefix,
  onChange
}: {
  readonly slot: string;
  readonly caption: string;
  /** What an empty choice means here, said in the operator's words. */
  readonly hint: string;
  readonly chosen: string;
  readonly testIdPrefix: string;
  readonly onChange: (value: string) => void;
}): ReactElement {
  const known = SOUND_IDS.some((id) => id === chosen);
  return (
    <div className="fx-slots__row">
      <label className="field">
        <span className="field__caption">{caption}</span>
        <select
          data-testid={`${testIdPrefix}-${slot}`}
          onChange={(event) => {
            onChange(event.target.value);
            playPreview(event.target.value);
          }}
          value={chosen}
        >
          <option value="">как сейчас</option>
          {SOUND_IDS.map((id) => (
            <option key={id} value={id}>
              {SOUND_LABELS[id]}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="button button--ghost sound-slots__play"
        data-testid={`${testIdPrefix}-play-${slot}`}
        disabled={!known}
        onClick={() => {
          playPreview(chosen);
        }}
      >
        ▶
      </button>
      {!known && <span className="fx-slots__hint">{hint}</span>}
    </div>
  );
}

/** The whole catalogue, to be listened to before anything is assigned. */
export function SoundLibrary({ testId }: { readonly testId: string }): ReactElement {
  return (
    <p className="sound-library" data-testid={testId}>
      <span className="fx-slots__hint">Прослушать:</span>
      {SOUND_IDS.map((id: SoundId) => (
        <button
          key={id}
          type="button"
          className="button button--ghost sound-library__item"
          onClick={() => {
            playPreview(id);
          }}
        >
          ▶ {SOUND_LABELS[id]}
        </button>
      ))}
    </p>
  );
}
