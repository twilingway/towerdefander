import { type BalanceTuning } from "@spaceship-defender/protocol";

import {
  AngularRateField,
  NumberField,
  SecondsField,
  WeaponKindField
} from "../../components/fields.js";

interface CannonSectionProps {
  readonly tuning: BalanceTuning;
  readonly patch: (values: Partial<BalanceTuning>) => void;
}

/** Пушка ганнера. */
export function CannonSection({ tuning, patch }: CannonSectionProps) {
  return (
    <>
      <h3 className="card__subtitle">Пушка ганнера</h3>
      <p className="screen__hint">
        Урон, перезарядка и нагрев работают одинаково при любом способе доставки. Остальное зависит
        от вида: кинетика летит и потому имеет скорость, радиус и время жизни снаряда; лазер бьёт
        мгновенно и вместо них имеет дальность луча; ракета летит как снаряд, но доворачивает к
        цели. Погашенные поля выбранный вид не читает.
      </p>
      <div className="card__grid">
        <WeaponKindField
          caption="Способ доставки"
          value={tuning.cannonWeaponKind}
          onChange={(cannonWeaponKind) => {
            patch({ cannonWeaponKind });
          }}
        />
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
          caption="Дальность луча"
          value={tuning.cannonLaserRange}
          disabled={tuning.cannonWeaponKind !== "laser"}
          onChange={(cannonLaserRange) => {
            patch({ cannonLaserRange });
          }}
        />
        <NumberField
          caption="Скорость снаряда"
          value={tuning.projectileSpeedPerSecond}
          disabled={tuning.cannonWeaponKind === "laser"}
          onChange={(projectileSpeedPerSecond) => {
            patch({ projectileSpeedPerSecond: projectileSpeedPerSecond });
          }}
        />
        <NumberField
          caption="Радиус снаряда"
          value={tuning.projectileRadius}
          disabled={tuning.cannonWeaponKind === "laser"}
          onChange={(projectileRadius) => {
            patch({ projectileRadius: projectileRadius });
          }}
        />
        <NumberField
          caption="Время жизни снаряда, мс"
          value={tuning.projectileLifetimeMs}
          disabled={tuning.cannonWeaponKind === "laser"}
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
