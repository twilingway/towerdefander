import type { ReactElement } from "react";
import { SOUND_IDS, type ShipSounds, type SoundId } from "@spaceship-defender/protocol";

import { SoundLibrary, SoundSlotRow } from "../../components/SoundSlotRow.js";

const SLOTS = [
  { key: "cannonShot", caption: "Выстрел пушки", hint: "Не выбрано — тишина" },
  { key: "mgShot", caption: "Выстрел пулемёта", hint: "Не выбрано — тишина" },
  { key: "hit", caption: "Попадание по корпусу", hint: "Не выбрано — тишина" },
  { key: "death", caption: "Уничтожение", hint: "Не выбрано — общий взрыв" }
] as const;

/**
 * Rebuilds the block with one slot changed.
 *
 * An empty choice removes the key rather than storing a blank, and a hull with
 * nothing chosen carries no block at all - which is what makes an untouched
 * preset sound exactly as it did before the slots existed.
 */
export function withShipSound(
  sounds: ShipSounds | undefined,
  slot: (typeof SLOTS)[number]["key"],
  value: string
): ShipSounds | undefined {
  const next: { cannonShot?: SoundId; mgShot?: SoundId; hit?: SoundId; death?: SoundId } = {};
  for (const candidate of SLOTS) {
    const raw = candidate.key === slot ? value : sounds?.[candidate.key];
    const chosen = raw === undefined ? undefined : asSound(raw);
    if (chosen !== undefined) next[candidate.key] = chosen;
  }
  return Object.keys(next).length === 0 ? undefined : next;
}

/**
 * The select hands back a plain string; this is where it becomes an id the
 * balance schema will accept. Anything unknown - an empty reset, or a preset
 * written by a newer build - falls through as "not chosen".
 */
function asSound(value: string): SoundId | undefined {
  return SOUND_IDS.find((id) => id === value);
}

/** What this hull is heard doing: two barrels, a hit on it, and its wreck. */
export function HullSoundSlots({
  sounds,
  onChange
}: {
  readonly sounds: ShipSounds | undefined;
  readonly onChange: (next: ShipSounds | undefined) => void;
}): ReactElement {
  return (
    <div className="fx-slots" data-testid="ship-sound-slots">
      {SLOTS.map((slot) => (
        <SoundSlotRow
          key={slot.key}
          caption={slot.caption}
          chosen={sounds?.[slot.key] ?? ""}
          hint={slot.hint}
          onChange={(value) => {
            onChange(withShipSound(sounds, slot.key, value));
          }}
          slot={slot.key}
          testIdPrefix="ship-sound"
        />
      ))}
      <SoundLibrary testId="ship-sound-library" />
    </div>
  );
}
