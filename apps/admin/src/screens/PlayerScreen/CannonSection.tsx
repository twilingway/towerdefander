import { type BalanceTuning } from "@spaceship-defender/protocol";

import { AngularRateField, NumberField, SecondsField } from "../../components/fields.js";

interface CannonSectionProps {
  readonly tuning: BalanceTuning;
  readonly patch: (values: Partial<BalanceTuning>) => void;
}

/** Пушка ганнера. */
export function CannonSection({ tuning, patch }: CannonSectionProps) {
  return (
    <>
      <h3 className="card__subtitle">Пушка ганнера</h3>
      <div className="card__grid">
        <NumberField
          caption="Урон"
          value={tuning.friendlyProjectileDamage}
          onChange={(friendlyProjectileDamage) => {
            patch({ friendlyProjectileDamage: friendlyProjectileDamage });
          }}
        />
        <SecondsField
          caption="Перезарядка, с"
          ticks={tuning.fireCooldownTicks}
          onChange={(fireCooldownTicks) => {
            patch({ fireCooldownTicks });
          }}
        />
        <NumberField
          caption="Скорость снаряда"
          value={tuning.projectileSpeedPerSecond}
          onChange={(projectileSpeedPerSecond) => {
            patch({ projectileSpeedPerSecond: projectileSpeedPerSecond });
          }}
        />
        <NumberField
          caption="Радиус снаряда"
          value={tuning.projectileRadius}
          onChange={(projectileRadius) => {
            patch({ projectileRadius: projectileRadius });
          }}
        />
        <NumberField
          caption="Время жизни снаряда, мс"
          value={tuning.projectileLifetimeMs}
          onChange={(projectileLifetimeMs) => {
            patch({ projectileLifetimeMs: Math.max(1, Math.round(projectileLifetimeMs)) });
          }}
        />
        <AngularRateField
          caption="Поворот турели, °/с"
          radians={tuning.turretMaxAngularSpeedPerSecond}
          onChange={(turretMaxAngularSpeedPerSecond) => {
            patch({ turretMaxAngularSpeedPerSecond });
          }}
        />
        <AngularRateField
          caption="Разгон турели, °/с²"
          step={10}
          radians={tuning.turretAngularAccelerationPerSecondSquared}
          onChange={(turretAngularAccelerationPerSecondSquared) => {
            patch({ turretAngularAccelerationPerSecondSquared });
          }}
        />
        <AngularRateField
          caption="Торможение турели, °/с²"
          step={10}
          radians={tuning.turretAngularBrakingPerSecondSquared}
          onChange={(turretAngularBrakingPerSecondSquared) => {
            patch({ turretAngularBrakingPerSecondSquared });
          }}
        />
        <NumberField
          caption="Ёмкость нагрева"
          value={tuning.cannonHeatCapacity}
          onChange={(cannonHeatCapacity) => {
            patch({ cannonHeatCapacity: cannonHeatCapacity });
          }}
        />
        <NumberField
          caption="Нагрев за выстрел"
          value={tuning.cannonHeatPerShot}
          onChange={(cannonHeatPerShot) => {
            patch({ cannonHeatPerShot: cannonHeatPerShot });
          }}
        />
        <NumberField
          caption="Охлаждение в секунду"
          value={tuning.cannonCoolingPerSecond}
          onChange={(cannonCoolingPerSecond) => {
            patch({ cannonCoolingPerSecond: cannonCoolingPerSecond });
          }}
        />
        <NumberField
          caption="Порог возврата в строй"
          value={tuning.cannonRearmThreshold}
          onChange={(cannonRearmThreshold) => {
            patch({ cannonRearmThreshold: cannonRearmThreshold });
          }}
        />
      </div>
    </>
  );
}
