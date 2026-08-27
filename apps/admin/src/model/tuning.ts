import { CAMERA_VIEW_ASPECT } from "@spaceship-defender/protocol";
import type {
  BalancePreset,
  BalancePresetsFile,
  BalanceTuning,
  EnemyWeaponTuning,
  EntityVisual
} from "@spaceship-defender/protocol";

import { weaponReach } from "../waveSummary.js";

export function activePresetOf(document: BalancePresetsFile): BalancePreset | undefined {
  return document.presets.find(({ id }) => id === document.activePresetId);
}

export function withTuning(
  document: BalancePresetsFile,
  tuning: BalanceTuning
): BalancePresetsFile {
  return {
    ...document,
    presets: document.presets.map((preset) =>
      preset.id === document.activePresetId ? { ...preset, tuning } : preset
    )
  };
}

export function scaleEntityVisual(visual: EntityVisual, modelScale: number): EntityVisual {
  if (visual === null) return null;
  return { ...visual, modelScale: Math.min(4, Math.max(0.2, modelScale)) };
}

export function rangeHint(
  weapon: EnemyWeaponTuning,
  preferredDistance: number,
  cameraViewWidth: number
): string {
  const reach = weaponReach(weapon);
  const framed = Math.round((cameraViewWidth * CAMERA_VIEW_ASPECT) / 2);
  const base = `Досягаемость снаряда ${String(reach)}, в кадре цель гарантированно видна до ${String(framed)}.`;
  if (weapon.engagementRange > reach) {
    return `${base} Дальность больше досягаемости: часть выстрелов истечёт по пути.`;
  }
  if (weapon.engagementRange < preferredDistance) {
    return `${base} Дальность меньше дистанции удержания ${String(preferredDistance)}: враг зависнет вне неё и не выстрелит.`;
  }
  if (weapon.engagementRange > framed) {
    return `${base} Огонь открывается из-за края экрана.`;
  }
  return base;
}
