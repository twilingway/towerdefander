import { type BalanceTuning } from "@spaceship-defender/protocol";

import { NumberField, SecondsField, WeaponKindField } from "../../components/fields.js";

interface MachineGunSectionProps {
  readonly tuning: BalanceTuning;
  readonly patch: (values: Partial<BalanceTuning>) => void;
}

/** Носовой ствол пилота: он же ось тяги, поэтому целится всем корпусом. */
export function MachineGunSection({ tuning, patch }: MachineGunSectionProps) {
  return (
    <>
      <h3 className="card__subtitle">Носовой ствол пилота</h3>
      <div className="card__grid">
        <WeaponKindField
          caption="Способ доставки"
          value={tuning.mgWeaponKind}
          onChange={(mgWeaponKind) => {
            patch({ mgWeaponKind });
          }}
        />
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
          caption="Дальность луча"
          value={tuning.mgLaserRange}
          disabled={tuning.mgWeaponKind !== "laser"}
          onChange={(mgLaserRange) => {
            patch({ mgLaserRange });
          }}
        />
        <NumberField
          caption="Скорость снаряда"
          value={tuning.mgProjectileSpeedPerSecond}
          disabled={tuning.mgWeaponKind === "laser"}
          onChange={(mgProjectileSpeedPerSecond) => {
            patch({ mgProjectileSpeedPerSecond: mgProjectileSpeedPerSecond });
          }}
        />
        <NumberField
          caption="Радиус снаряда"
          value={tuning.mgProjectileRadius}
          disabled={tuning.mgWeaponKind === "laser"}
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
