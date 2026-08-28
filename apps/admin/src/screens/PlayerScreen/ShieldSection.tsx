import { type BalanceTuning } from "@spaceship-defender/protocol";

import { AngularRateField, NumberField } from "../../components/fields.js";

interface ShieldSectionProps {
  readonly tuning: BalanceTuning;
  readonly patch: (values: Partial<BalanceTuning>) => void;
}

/** Щит оператора. */
export function ShieldSection({ tuning, patch }: ShieldSectionProps) {
  return (
    <>
      <h3 className="card__subtitle">Щит</h3>
      <div className="card__grid">
        <NumberField
          caption="Ёмкость"
          value={tuning.shieldCapacity}
          onChange={(shieldCapacity) => {
            patch({ shieldCapacity: shieldCapacity });
          }}
        />
        <NumberField
          caption="Расход в секунду"
          value={tuning.shieldDrainPerSecond}
          onChange={(shieldDrainPerSecond) => {
            patch({ shieldDrainPerSecond: shieldDrainPerSecond });
          }}
        />
        <NumberField
          caption="Восстановление в секунду"
          value={tuning.shieldRechargePerSecond}
          onChange={(shieldRechargePerSecond) => {
            patch({ shieldRechargePerSecond: shieldRechargePerSecond });
          }}
        />
        <NumberField
          caption="Радиус"
          value={tuning.shieldRadius}
          onChange={(shieldRadius) => {
            patch({ shieldRadius: shieldRadius });
          }}
        />
        <AngularRateField
          caption="Ширина сектора, °"
          radians={tuning.shieldArcRadians}
          onChange={(shieldArcRadians) => {
            patch({ shieldArcRadians });
          }}
        />
        <AngularRateField
          caption="Поворот сектора, °/с"
          radians={tuning.shieldMaxAngularSpeedPerSecond}
          onChange={(shieldMaxAngularSpeedPerSecond) => {
            patch({ shieldMaxAngularSpeedPerSecond });
          }}
        />
        <AngularRateField
          caption="Разгон поворота, °/с²"
          step={10}
          radians={tuning.shieldAngularAccelerationPerSecondSquared}
          onChange={(shieldAngularAccelerationPerSecondSquared) => {
            patch({ shieldAngularAccelerationPerSecondSquared });
          }}
        />
        <AngularRateField
          caption="Торможение поворота, °/с²"
          step={10}
          radians={tuning.shieldAngularBrakingPerSecondSquared}
          onChange={(shieldAngularBrakingPerSecondSquared) => {
            patch({ shieldAngularBrakingPerSecondSquared });
          }}
        />
      </div>
    </>
  );
}
