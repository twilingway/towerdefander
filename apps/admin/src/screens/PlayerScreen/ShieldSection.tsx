import { type BalanceTuning } from "@spaceship-defender/protocol";

import { AngularRateField, NumberField, PercentField } from "../../components/fields.js";

interface ShieldSectionProps {
  readonly tuning: BalanceTuning;
  readonly patch: (values: Partial<BalanceTuning>) => void;
}

/** Щит оператора. */
export function ShieldSection({ tuning, patch }: ShieldSectionProps) {
  return (
    <>
      <h3 className="card__subtitle">Щит</h3>
      <p className="screen__hint">
        Такт симуляции — 20 в секунду, так что 20 тиков это секунда. На подъёме щит ещё не защищает
        и не тратит энергию; минимум работы нельзя оборвать раньше срока, а остывание не пускает
        включить его снова. Три нуля возвращают мгновенное переключение.
      </p>
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
          caption="Подъём, тиков"
          value={tuning.shieldEngageTicks}
          onChange={(shieldEngageTicks) => {
            patch({ shieldEngageTicks: Math.max(0, Math.round(shieldEngageTicks)) });
          }}
        />
        <NumberField
          caption="Минимум работы, тиков"
          value={tuning.shieldMinimumUpTicks}
          onChange={(shieldMinimumUpTicks) => {
            patch({ shieldMinimumUpTicks: Math.max(0, Math.round(shieldMinimumUpTicks)) });
          }}
        />
        <NumberField
          caption="Остывание, тиков"
          value={tuning.shieldCooldownTicks}
          onChange={(shieldCooldownTicks) => {
            patch({ shieldCooldownTicks: Math.max(0, Math.round(shieldCooldownTicks)) });
          }}
        />
        <PercentField
          caption="Порог перевзвода, % заряда"
          fraction={tuning.shieldRearmEnergyFraction}
          onChange={(shieldRearmEnergyFraction) => {
            patch({
              shieldRearmEnergyFraction: Math.min(1, Math.max(0.01, shieldRearmEnergyFraction))
            });
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
