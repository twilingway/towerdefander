import { type BalanceTuning } from "@spaceship-defender/protocol";

import { AngularRateField, NumberField } from "../../components/fields.js";

interface HullSectionProps {
  readonly tuning: BalanceTuning;
  readonly patch: (values: Partial<BalanceTuning>) => void;
}

/** Корпус и ход. */
export function HullSection({ tuning, patch }: HullSectionProps) {
  return (
    <>
      <h3 className="card__subtitle">Корпус и ход</h3>
      <div className="card__grid">
        <NumberField
          caption="HP корпуса"
          value={tuning.spaceshipMaxHp}
          onChange={(spaceshipMaxHp) => {
            patch({ spaceshipMaxHp: spaceshipMaxHp });
          }}
        />
        <NumberField
          caption="Радиус поражения"
          value={tuning.spaceshipRadius}
          onChange={(spaceshipRadius) => {
            patch({ spaceshipRadius: spaceshipRadius });
          }}
        />
        <NumberField
          caption="Скорость"
          value={tuning.spaceshipSpeedPerSecond}
          onChange={(spaceshipSpeedPerSecond) => {
            patch({ spaceshipSpeedPerSecond: spaceshipSpeedPerSecond });
          }}
        />
        <NumberField
          caption="Ускорение"
          value={tuning.spaceshipAccelerationPerSecondSquared}
          onChange={(spaceshipAccelerationPerSecondSquared) => {
            patch({
              spaceshipAccelerationPerSecondSquared: spaceshipAccelerationPerSecondSquared
            });
          }}
        />
        <NumberField
          caption="Торможение"
          value={tuning.spaceshipBrakingPerSecondSquared}
          onChange={(spaceshipBrakingPerSecondSquared) => {
            patch({ spaceshipBrakingPerSecondSquared: spaceshipBrakingPerSecondSquared });
          }}
        />
        <AngularRateField
          caption="Поворот носа, °/с"
          radians={tuning.headingMaxAngularSpeedPerSecond}
          onChange={(headingMaxAngularSpeedPerSecond) => {
            patch({ headingMaxAngularSpeedPerSecond });
          }}
        />
        <AngularRateField
          caption="Разгон поворота, °/с²"
          step={50}
          radians={tuning.headingAngularAccelerationPerSecondSquared}
          onChange={(headingAngularAccelerationPerSecondSquared) => {
            patch({ headingAngularAccelerationPerSecondSquared });
          }}
        />
        <AngularRateField
          caption="Торможение поворота, °/с²"
          step={50}
          radians={tuning.headingAngularBrakingPerSecondSquared}
          onChange={(headingAngularBrakingPerSecondSquared) => {
            patch({ headingAngularBrakingPerSecondSquared });
          }}
        />
      </div>
    </>
  );
}
