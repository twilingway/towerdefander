import type { PublicMachineGunView } from "@spaceship-defender/protocol";

import { getResourcePercent } from "./combatHudViewModel.js";

interface MachineGunHeatProps {
  readonly machineGun: PublicMachineGunView;
}

export function MachineGunHeat({ machineGun }: MachineGunHeatProps) {
  const heatPercent = getResourcePercent(machineGun.heat, machineGun.capacity);
  const accessibleCapacity = machineGun.capacity > 0 ? machineGun.capacity : 100;
  const heatLabel = `${String(Math.round(machineGun.heat))} / ${String(Math.round(machineGun.capacity))}`;

  return (
    <div
      className={`machine-gun-hud${machineGun.overheated ? " machine-gun-hud--overheated" : ""}`}
      data-testid="machine-gun-heat"
      data-heat={machineGun.heat}
      data-capacity={machineGun.capacity}
      data-overheated={machineGun.overheated}
    >
      <span>Пулемёт</span>
      <strong>{machineGun.overheated ? "ПЕРЕГРЕВ" : `${String(Math.round(heatPercent))}%`}</strong>
      <div
        className="hud-energy hud-energy--machine-gun"
        role="meter"
        aria-label="Нагрев носового пулемёта"
        aria-valuemin={0}
        aria-valuemax={accessibleCapacity}
        aria-valuenow={machineGun.heat}
        aria-valuetext={heatLabel}
      >
        <i style={{ width: `${String(heatPercent)}%` }} />
      </div>
      <small>{heatLabel}</small>
    </div>
  );
}
