import { type BalanceTuning } from "@spaceship-defender/protocol";

import { DegreesField, NumberField } from "../../components/fields.js";

interface WeaponKindSectionProps {
  readonly tuning: BalanceTuning;
  readonly patch: (values: Partial<BalanceTuning>) => void;
}

/**
 * The handful of numbers a laser or a missile shares between both barrels. The
 * choice of kind lives with each barrel, because that is where it decides which
 * of the barrel's own numbers are read at all; only these three are common, so
 * only these three are here — and the section is hidden entirely while both
 * barrels are kinetic.
 */
export function WeaponKindSection({ tuning, patch }: WeaponKindSectionProps) {
  const kinds = [tuning.cannonWeaponKind, tuning.mgWeaponKind];
  const hasLaser = kinds.includes("laser");
  const hasMissile = kinds.includes("missile");
  if (!hasLaser && !hasMissile) return null;

  return (
    <>
      <h3 className="card__subtitle">Общие числа лазера и ракет</h3>
      <p className="screen__hint">
        Эти три общие на оба ствола: дальность луча у каждого своя и стоит в его разделе, а толщина
        луча, доворот ракеты и конус захвата — одни на корабль. Ракета берёт цель один раз при пуске
        среди врагов в конусе вокруг оси ствола; если цель погибла, ракета летит прямо и новую не
        ищет.
      </p>
      <div className="card__grid">
        {hasLaser && (
          <NumberField
            caption="Толщина луча"
            value={tuning.laserBeamRadius}
            onChange={(laserBeamRadius) => {
              patch({ laserBeamRadius });
            }}
          />
        )}
        {hasMissile && (
          <NumberField
            caption="Доворот ракеты, рад/с"
            step={0.1}
            value={tuning.friendlyMissileTurnRatePerSecond}
            onChange={(friendlyMissileTurnRatePerSecond) => {
              patch({ friendlyMissileTurnRatePerSecond });
            }}
          />
        )}
        {hasMissile && (
          <DegreesField
            caption="Конус захвата"
            radians={tuning.friendlyMissileAcquireConeRadians}
            onChange={(friendlyMissileAcquireConeRadians) => {
              patch({ friendlyMissileAcquireConeRadians });
            }}
          />
        )}
      </div>
    </>
  );
}
