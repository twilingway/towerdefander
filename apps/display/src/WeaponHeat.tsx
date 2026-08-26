import type { PublicWeaponHeatView } from "@spaceship-defender/protocol";

import { getResourcePercent } from "./combatHudViewModel.js";

interface WeaponHeatRowProps {
  readonly weapon: PublicWeaponHeatView;
  readonly caption: string;
  readonly meterLabel: string;
  readonly testId: string;
  /** Drives the bar colour; the two weapons must never blur together. */
  readonly variant: "cannon" | "machine-gun";
}

function WeaponHeatRow({ weapon, caption, meterLabel, testId, variant }: WeaponHeatRowProps) {
  const heatPercent = getResourcePercent(weapon.heat, weapon.capacity);
  const accessibleCapacity = weapon.capacity > 0 ? weapon.capacity : 100;
  const heatLabel = `${String(Math.round(weapon.heat))} / ${String(Math.round(weapon.capacity))}`;

  return (
    <div
      className={`weapon-heat-row${weapon.overheated ? " weapon-heat-row--overheated" : ""}`}
      data-testid={testId}
      data-heat={weapon.heat}
      data-capacity={weapon.capacity}
      data-overheated={weapon.overheated}
    >
      <span>{caption}</span>
      <div
        className={`hud-energy hud-energy--${variant}`}
        role="meter"
        aria-label={meterLabel}
        aria-valuemin={0}
        aria-valuemax={accessibleCapacity}
        aria-valuenow={weapon.heat}
        aria-valuetext={heatLabel}
      >
        <i style={{ width: `${String(heatPercent)}%` }} />
      </div>
      <small>{weapon.overheated ? "ПЕРЕГРЕВ" : `${String(Math.round(heatPercent))}%`}</small>
    </div>
  );
}

interface WeaponHeatProps {
  readonly cannon: PublicWeaponHeatView;
  readonly machineGun: PublicWeaponHeatView;
}

/**
 * Both weapons share one HUD tile. The cannon grew a heat meter when firing it
 * turned out to be free — with nothing to spend, shooting at everything beat
 * choosing targets — and the HUD grid is six columns wide, so a seventh tile
 * wrapped onto a second row and pushed the whole bar up over the radar.
 */
export function WeaponHeat({ cannon, machineGun }: WeaponHeatProps) {
  const anyOverheated = cannon.overheated || machineGun.overheated;

  return (
    <div
      className={`machine-gun-hud${anyOverheated ? " machine-gun-hud--overheated" : ""}`}
      data-testid="weapon-heat"
    >
      <span>Оружие</span>
      <WeaponHeatRow
        weapon={cannon}
        caption="Пушка"
        meterLabel="Нагрев орудия наводчика"
        testId="cannon-heat"
        variant="cannon"
      />
      <WeaponHeatRow
        weapon={machineGun}
        caption="Пулемёт"
        meterLabel="Нагрев носового пулемёта"
        testId="machine-gun-heat"
        variant="machine-gun"
      />
    </div>
  );
}
