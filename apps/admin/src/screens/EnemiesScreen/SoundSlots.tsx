import type { ReactElement } from "react";
import { SOUND_IDS, type EnemySounds, type SoundId } from "@spaceship-defender/protocol";

import { SoundLibrary, SoundSlotRow } from "../../components/SoundSlotRow.js";

const SLOTS = [
  { key: "death", caption: "Смерть", hint: "Не выбрано — боссу взрыв боса, прочим взрыв" },
  { key: "hit", caption: "Попадание", hint: "Не выбрано — тишина" },
  { key: "shot", caption: "Выстрел", hint: "Не выбрано — тишина" }
] as const;

/**
 * Rebuilds the slots with one of them changed.
 *
 * An empty choice removes the key rather than storing a blank, and an archetype
 * with nothing chosen carries no block at all - which is what makes an
 * untouched preset sound exactly as it did before the slots existed.
 */
export function withSoundSlot(
  sounds: EnemySounds | undefined,
  slot: (typeof SLOTS)[number]["key"],
  value: string
): EnemySounds | undefined {
  const next: { death?: SoundId; hit?: SoundId; shot?: SoundId } = {};
  for (const candidate of SLOTS) {
    const raw = candidate.key === slot ? value : sounds?.[candidate.key];
    const chosen = raw === undefined ? undefined : asSound(raw);
    if (chosen !== undefined) next[candidate.key] = chosen;
  }
  return Object.keys(next).length === 0 ? undefined : next;
}

function asSound(value: string): SoundId | undefined {
  return SOUND_IDS.find((id) => id === value);
}

/** What this archetype is heard doing on each of its events. */
export function SoundSlots({
  sounds,
  onChange
}: {
  readonly sounds: EnemySounds | undefined;
  readonly onChange: (next: EnemySounds | undefined) => void;
}): ReactElement {
  return (
    <div className="fx-slots" data-testid="enemy-sound-slots">
      {SLOTS.map((slot) => (
        <SoundSlotRow
          key={slot.key}
          caption={slot.caption}
          chosen={sounds?.[slot.key] ?? ""}
          hint={slot.hint}
          onChange={(value) => {
            onChange(withSoundSlot(sounds, slot.key, value));
          }}
          slot={slot.key}
          testIdPrefix="enemy-sound"
        />
      ))}
      <SoundLibrary testId="enemy-sound-library" />
    </div>
  );
}
