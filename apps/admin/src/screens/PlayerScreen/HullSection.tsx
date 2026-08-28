import { type BalanceTuning } from "@spaceship-defender/protocol";

import { NumberField } from "../../components/fields.js";

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
        {/* Degrees rather than radians: an operator judges a turn in degrees per
            second, and 180 reads as "half a turn a second" at a glance. */}
        <NumberField
          caption="Поворот носа, °/с"
          step={5}
          value={toDegrees(tuning.headingMaxAngularSpeedPerSecond)}
          onChange={(degrees) => {
            patch({ headingMaxAngularSpeedPerSecond: toRadians(degrees) });
          }}
        />
        <NumberField
          caption="Разгон поворота, °/с²"
          step={50}
          value={toDegrees(tuning.headingAngularAccelerationPerSecondSquared)}
          onChange={(degrees) => {
            patch({ headingAngularAccelerationPerSecondSquared: toRadians(degrees) });
          }}
        />
        <NumberField
          caption="Торможение поворота, °/с²"
          step={50}
          value={toDegrees(tuning.headingAngularBrakingPerSecondSquared)}
          onChange={(degrees) => {
            patch({ headingAngularBrakingPerSecondSquared: toRadians(degrees) });
          }}
        />
      </div>
    </>
  );
}

function toDegrees(radians: number): number {
  return Math.round((radians * 180) / Math.PI);
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}
