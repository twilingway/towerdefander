import type { ReactElement } from "react";
import { FX_EFFECTS, type FxEffect } from "@spaceship-defender/fx-assets";
import {
  FX_EVENT_EFFECT_IDS,
  FX_LOOP_EFFECT_IDS,
  type FxEventEffectId,
  type FxLoopEffectId,
  type ShipEffects
} from "@spaceship-defender/protocol";

import { EffectSlotRow } from "../../components/EffectSlotRow.js";

/**
 * Two slots, two lists, and that is the point: the barrier is a loop and the
 * mark is a one-shot. A loop hung on an impact would never end, and a one-shot
 * stretched over a raised sector would show once and leave the shield bare.
 */
const LOOPS: readonly FxEffect[] = FX_EFFECTS.filter((effect) =>
  (FX_LOOP_EFFECT_IDS as readonly string[]).includes(effect.id)
);
const ONE_SHOTS: readonly FxEffect[] = FX_EFFECTS.filter((effect) =>
  (FX_EVENT_EFFECT_IDS as readonly string[]).includes(effect.id)
);

/**
 * Rebuilds the block with one slot changed.
 *
 * An empty choice removes the key rather than storing a blank, and a hull with
 * nothing chosen carries no block at all - which is what makes an untouched
 * preset draw its shield exactly as it did before the slots existed.
 */
export function withShipEffect(
  effects: ShipEffects | undefined,
  slot: "shieldBand" | "shieldImpact",
  value: string
): ShipEffects | undefined {
  const band = slot === "shieldBand" ? asLoop(value) : asLoop(effects?.shieldBand ?? "");
  const impact =
    slot === "shieldImpact" ? asOneShot(value) : asOneShot(effects?.shieldImpact ?? "");
  const next: { shieldBand?: FxLoopEffectId; shieldImpact?: FxEventEffectId } = {};
  if (band !== undefined) next.shieldBand = band;
  if (impact !== undefined) next.shieldImpact = impact;
  return Object.keys(next).length === 0 ? undefined : next;
}

/**
 * The select hands back a plain string; this is where it becomes an id the
 * balance schema will accept. Anything unknown - an empty reset, or a preset
 * written by a newer build - falls through as "not chosen".
 */
function asLoop(value: string): FxLoopEffectId | undefined {
  return LOOPS.some((candidate) => candidate.id === value) ? (value as FxLoopEffectId) : undefined;
}

function asOneShot(value: string): FxEventEffectId | undefined {
  return ONE_SHOTS.some((candidate) => candidate.id === value)
    ? (value as FxEventEffectId)
    : undefined;
}

/** What this hull's shield is drawn with. */
export function ShieldEffectSlots({
  effects,
  onChange
}: {
  readonly effects: ShipEffects | undefined;
  readonly onChange: (next: ShipEffects | undefined) => void;
}): ReactElement {
  return (
    <div className="fx-slots" data-testid="ship-effect-slots">
      <EffectSlotRow
        caption="Барьер щита"
        choices={LOOPS}
        chosen={effects?.shieldBand ?? ""}
        hint="Не выбрано — запечённый барьер дисплея"
        onChange={(value) => {
          onChange(withShipEffect(effects, "shieldBand", value));
        }}
        slot="shieldBand"
        testIdPrefix="ship-effect"
      />
      <EffectSlotRow
        caption="Попадание в щит"
        choices={ONE_SHOTS}
        chosen={effects?.shieldImpact ?? ""}
        hint="Не выбрано — запечённая вспышка дисплея"
        onChange={(value) => {
          onChange(withShipEffect(effects, "shieldImpact", value));
        }}
        slot="shieldImpact"
        testIdPrefix="ship-effect"
      />
    </div>
  );
}
