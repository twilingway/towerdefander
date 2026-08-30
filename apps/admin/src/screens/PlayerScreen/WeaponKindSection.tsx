import {
  FRIENDLY_WEAPON_KINDS,
  type BalanceTuning,
  type FriendlyWeaponKind
} from "@spaceship-defender/protocol";

import { DegreesField, NumberField } from "../../components/fields.js";

interface WeaponKindSectionProps {
  readonly tuning: BalanceTuning;
  readonly patch: (values: Partial<BalanceTuning>) => void;
}

const KIND_LABELS: Record<FriendlyWeaponKind, string> = {
  kinetic: "кинетика — снаряд летит, нужно упреждение",
  laser: "лазер — не мажет, но не достаёт",
  missile: "ракета — догоняет сама, но медленная"
};

/** Чем стреляют два ствола корабля и что стоит каждый способ. */
export function WeaponKindSection({ tuning, patch }: WeaponKindSectionProps) {
  return (
    <>
      <h3 className="card__subtitle">Виды оружия</h3>
      <p className="screen__hint">
        Урон, перезарядка и нагрев у ствола остаются те же, каким бы способом он ни доставлял урон.
        Разница в цене: кинетика требует упреждения, лазер не может промахнуться и потому ограничен
        дальностью, ракета догоняет сама, но летит медленно и берёт цель один раз при пуске — если
        цель погибла, ракета летит прямо. Сводить их по силе надо прогонами на одном корпусе, а не
        на глаз.
      </p>
      <div className="card__grid">
        <label className="field">
          <span className="field__caption">Пушка ганнера</span>
          <select
            className="field__input"
            value={tuning.cannonWeaponKind}
            onChange={(event) => {
              patch({ cannonWeaponKind: event.target.value as FriendlyWeaponKind });
            }}
          >
            {FRIENDLY_WEAPON_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {KIND_LABELS[kind]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__caption">Носовой ствол пилота</span>
          <select
            className="field__input"
            value={tuning.mgWeaponKind}
            onChange={(event) => {
              patch({ mgWeaponKind: event.target.value as FriendlyWeaponKind });
            }}
          >
            {FRIENDLY_WEAPON_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {KIND_LABELS[kind]}
              </option>
            ))}
          </select>
        </label>
        <NumberField
          caption="Дальность луча, пушка"
          value={tuning.cannonLaserRange}
          onChange={(cannonLaserRange) => {
            patch({ cannonLaserRange });
          }}
        />
        <NumberField
          caption="Дальность луча, нос"
          value={tuning.mgLaserRange}
          onChange={(mgLaserRange) => {
            patch({ mgLaserRange });
          }}
        />
        <NumberField
          caption="Толщина луча"
          value={tuning.laserBeamRadius}
          onChange={(laserBeamRadius) => {
            patch({ laserBeamRadius });
          }}
        />
        <NumberField
          caption="Доворот ракеты, рад/с"
          value={tuning.friendlyMissileTurnRatePerSecond}
          onChange={(friendlyMissileTurnRatePerSecond) => {
            patch({ friendlyMissileTurnRatePerSecond });
          }}
        />
        <DegreesField
          caption="Конус захвата"
          radians={tuning.friendlyMissileAcquireConeRadians}
          onChange={(friendlyMissileAcquireConeRadians) => {
            patch({ friendlyMissileAcquireConeRadians });
          }}
        />
      </div>
    </>
  );
}
