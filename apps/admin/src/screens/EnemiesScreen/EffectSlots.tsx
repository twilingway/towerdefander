import type { ReactElement } from "react";
import { FX_EFFECTS, type FxEffect } from "@spaceship-defender/fx-assets";
import {
  FX_EVENT_EFFECT_IDS,
  type EnemyEventEffects,
  type FxEventEffectId
} from "@spaceship-defender/protocol";

import { spriteFrameStyle } from "../../components/fxSprite.js";

/** A still from a third of the way in, where a burst is at its widest. */
const THUMBNAIL_SCALE = 0.6;

const SLOTS = [
  { key: "death", caption: "Смерть", hint: "Не выбрано — боссу взрыв, прочим обломки" },
  { key: "hit", caption: "Попадание", hint: "Не выбрано — ничего" },
  { key: "shot", caption: "Выстрел", hint: "Не выбрано — ничего" }
] as const;

/** Only one-shots: a loop hung on an event would never end. */
const CHOICES: readonly FxEffect[] = FX_EFFECTS.filter((effect) =>
  (FX_EVENT_EFFECT_IDS as readonly string[]).includes(effect.id)
);

/**
 * Rebuilds the slots with one of them changed.
 *
 * An empty choice removes the key rather than storing a blank, and an archetype
 * with nothing chosen carries no block at all - which is what makes an untouched
 * preset play exactly as it did before the slots existed.
 */
export function withEffectSlot(
  effects: EnemyEventEffects | undefined,
  slot: (typeof SLOTS)[number]["key"],
  value: string
): EnemyEventEffects | undefined {
  const next: {
    death?: FxEventEffectId;
    hit?: FxEventEffectId;
    shot?: FxEventEffectId;
  } = {};
  for (const candidate of SLOTS) {
    const raw = candidate.key === slot ? value : effects?.[candidate.key];
    const chosen = raw === undefined ? undefined : asEventEffect(raw);
    if (chosen !== undefined) next[candidate.key] = chosen;
  }
  return Object.keys(next).length === 0 ? undefined : next;
}

/**
 * The select hands back a plain string; this is where it becomes an id the
 * balance schema will accept. Anything unknown - an empty reset, or a preset
 * written by a newer build - falls through as "not chosen".
 */
function asEventEffect(value: string): FxEventEffectId | undefined {
  return CHOICES.some((candidate) => candidate.id === value)
    ? (value as FxEventEffectId)
    : undefined;
}

/**
 * What this archetype plays on each of its events.
 *
 * A select rather than the searchable grid the silhouettes use: there are three
 * one-shots to choose from, and a search box over three rows is noise. The
 * thumbnail is what actually answers "which one is that".
 */
export function EffectSlots({
  effects,
  onChange
}: {
  readonly effects: EnemyEventEffects | undefined;
  readonly onChange: (next: EnemyEventEffects | undefined) => void;
}): ReactElement {
  return (
    <div className="fx-slots" data-testid="enemy-effect-slots">
      {SLOTS.map((slot) => {
        const chosen = effects?.[slot.key] ?? "";
        const effect = CHOICES.find((candidate) => candidate.id === chosen);
        return (
          <div className="fx-slots__row" key={slot.key}>
            <label className="field">
              <span className="field__caption">{slot.caption}</span>
              <select
                data-testid={`enemy-effect-${slot.key}`}
                onChange={(event) => {
                  onChange(withEffectSlot(effects, slot.key, event.target.value));
                }}
                value={chosen}
              >
                <option value="">как сейчас</option>
                {CHOICES.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.title}
                  </option>
                ))}
              </select>
            </label>
            {effect === undefined ? (
              <span className="fx-slots__hint">{slot.hint}</span>
            ) : (
              <span
                className="fx-card__thumb"
                data-testid={`enemy-effect-thumb-${slot.key}`}
                style={spriteFrameStyle(
                  effect,
                  Math.floor(effect.meta.frames / 3),
                  THUMBNAIL_SCALE
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
