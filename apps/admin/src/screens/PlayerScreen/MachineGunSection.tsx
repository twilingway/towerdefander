import { type BalanceTuning } from "@spaceship-defender/protocol";

import { NumberField, SecondsField } from "../../components/fields.js";

interface MachineGunSectionProps {
  readonly tuning: BalanceTuning;
  readonly patch: (values: Partial<BalanceTuning>) => void;
}

/** Носовой пулемёт. */
export function MachineGunSection({ tuning, patch }: MachineGunSectionProps) {
  return (
    <>
      <h3 className="card__subtitle">Носовой пулемёт</h3>
      <div className="card__grid">
        <NumberField
          caption="Урон"
          value={tuning.mgDamage}
          onChange={(mgDamage) => {
            patch({ mgDamage: mgDamage });
          }}
        />
        <SecondsField
          caption="Перезарядка, с"
          ticks={tuning.mgFireCooldownTicks}
          onChange={(mgFireCooldownTicks) => {
            patch({ mgFireCooldownTicks });
          }}
        />
        <NumberField
          caption="Скорость снаряда"
          value={tuning.mgProjectileSpeedPerSecond}
          onChange={(mgProjectileSpeedPerSecond) => {
            patch({ mgProjectileSpeedPerSecond: mgProjectileSpeedPerSecond });
          }}
        />
        <NumberField
          caption="Радиус снаряда"
          value={tuning.mgProjectileRadius}
          onChange={(mgProjectileRadius) => {
            patch({ mgProjectileRadius: mgProjectileRadius });
          }}
        />
        <NumberField
          caption="Ёмкость нагрева"
          value={tuning.mgHeatCapacity}
          onChange={(mgHeatCapacity) => {
            patch({ mgHeatCapacity: mgHeatCapacity });
          }}
        />
        <NumberField
          caption="Нагрев за выстрел"
          value={tuning.mgHeatPerShot}
          onChange={(mgHeatPerShot) => {
            patch({ mgHeatPerShot: mgHeatPerShot });
          }}
        />
        <NumberField
          caption="Охлаждение в секунду"
          value={tuning.mgCoolingPerSecond}
          onChange={(mgCoolingPerSecond) => {
            patch({ mgCoolingPerSecond: mgCoolingPerSecond });
          }}
        />
        <NumberField
          caption="Порог возврата в строй"
          value={tuning.mgRearmThreshold}
          onChange={(mgRearmThreshold) => {
            patch({ mgRearmThreshold: mgRearmThreshold });
          }}
        />
      </div>
    </>
  );
}
