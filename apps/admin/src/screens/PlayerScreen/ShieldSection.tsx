import { type BalanceTuning } from "@spaceship-defender/protocol";

import { NumberField } from "../../components/fields.js";

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
        <NumberField
          caption="Ширина сектора, рад"
          step={0.05}
          value={tuning.shieldArcRadians}
          onChange={(shieldArcRadians) => {
            patch({ shieldArcRadians: shieldArcRadians });
          }}
        />
        <NumberField
          caption="Поворот сектора, рад/с"
          step={0.05}
          value={tuning.shieldMaxAngularSpeedPerSecond}
          onChange={(shieldMaxAngularSpeedPerSecond) => {
            patch({ shieldMaxAngularSpeedPerSecond: shieldMaxAngularSpeedPerSecond });
          }}
        />
        <NumberField
          caption="Разгон поворота, рад/с²"
          step={0.05}
          value={tuning.shieldAngularAccelerationPerSecondSquared}
          onChange={(shieldAngularAccelerationPerSecondSquared) => {
            patch({
              shieldAngularAccelerationPerSecondSquared: shieldAngularAccelerationPerSecondSquared
            });
          }}
        />
        <NumberField
          caption="Торможение поворота, рад/с²"
          step={0.05}
          value={tuning.shieldAngularBrakingPerSecondSquared}
          onChange={(shieldAngularBrakingPerSecondSquared) => {
            patch({ shieldAngularBrakingPerSecondSquared: shieldAngularBrakingPerSecondSquared });
          }}
        />
      </div>
    </>
  );
}
