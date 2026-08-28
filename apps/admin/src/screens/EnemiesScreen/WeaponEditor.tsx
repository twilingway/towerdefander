import {
  MAX_ENEMY_WEAPONS,
  type BalanceTuning,
  type EnemyArchetype,
  type EnemyWeaponTuning
} from "@spaceship-defender/protocol";

import { AssetPicker } from "../../AssetPicker.js";
import { AngularRateField, NumberField, SecondsField } from "../../components/fields.js";
import { rangeHint, scaleEntityVisual } from "../../model/tuning.js";

interface WeaponEditorProps {
  readonly kind: string;
  readonly archetype: EnemyArchetype;
  readonly tuning: BalanceTuning;
  readonly addWeapon: (kind: string) => void;
  readonly removeWeapon: (kind: string, weaponIndex: number) => void;
  readonly patchWeapon: (
    kind: string,
    weaponIndex: number,
    patch: Partial<EnemyWeaponTuning>
  ) => void;
}

/** The weapon list of one archetype: add, remove and tune each barrel. */
export function WeaponEditor({
  kind,
  archetype,
  tuning,
  addWeapon,
  removeWeapon,
  patchWeapon
}: WeaponEditorProps) {
  return (
    <>
      <h4 className="card__subtitle">
        Оружие
        <button
          className="button card__add-weapon"
          type="button"
          disabled={archetype.weapons.length >= MAX_ENEMY_WEAPONS}
          onClick={() => {
            addWeapon(kind);
          }}
        >
          + орудие
        </button>
      </h4>
      {archetype.weapons.map((weapon, weaponIndex) => (
        <div className="weapon" key={`${kind}-weapon-${String(weaponIndex)}`}>
          <div className="weapon__head">
            <span className="field__caption">Орудие {weaponIndex + 1}</span>
            <button
              className="button button--ghost"
              type="button"
              disabled={archetype.weapons.length === 1}
              onClick={() => {
                removeWeapon(kind, weaponIndex);
              }}
            >
              Убрать
            </button>
          </div>
          <div className="card__grid">
            <label className="field">
              <span className="field__caption">Тип</span>
              <select
                className="field__input"
                value={weapon.kind}
                onChange={(event) => {
                  patchWeapon(kind, weaponIndex, {
                    kind: event.target.value === "missile" ? "missile" : "bullet"
                  });
                }}
              >
                <option value="bullet">пуля</option>
                <option value="missile">ракета</option>
              </select>
            </label>
            <SecondsField
              caption="Перезарядка, с"
              ticks={weapon.cooldownTicks}
              onChange={(cooldownTicks) => {
                patchWeapon(kind, weaponIndex, { cooldownTicks });
              }}
            />
            <NumberField
              caption="Урон"
              value={weapon.damage}
              onChange={(damage) => {
                patchWeapon(kind, weaponIndex, { damage });
              }}
            />
            <NumberField
              caption="Цена для щита"
              value={weapon.shieldHitCost}
              onChange={(shieldHitCost) => {
                patchWeapon(kind, weaponIndex, { shieldHitCost });
              }}
            />
            <NumberField
              caption="Скорость снаряда"
              value={weapon.projectileSpeedPerSecond}
              onChange={(projectileSpeedPerSecond) => {
                patchWeapon(kind, weaponIndex, { projectileSpeedPerSecond });
              }}
            />
            <NumberField
              caption="Радиус снаряда"
              value={weapon.projectileRadius}
              onChange={(projectileRadius) => {
                patchWeapon(kind, weaponIndex, { projectileRadius });
              }}
            />
            <SecondsField
              caption="Жизнь снаряда, с"
              ticks={weapon.projectileLifetimeTicks}
              onChange={(projectileLifetimeTicks) => {
                patchWeapon(kind, weaponIndex, { projectileLifetimeTicks });
              }}
            />
            <NumberField
              caption="Дальность огня"
              min={1}
              step={50}
              value={weapon.engagementRange}
              onChange={(engagementRange) => {
                patchWeapon(kind, weaponIndex, {
                  engagementRange: Math.max(1, Math.round(engagementRange))
                });
              }}
            />
            <NumberField
              caption="Снарядов в залпе"
              min={1}
              value={weapon.burstCount}
              onChange={(burstCount) => {
                patchWeapon(kind, weaponIndex, {
                  burstCount: Math.max(1, Math.round(burstCount))
                });
              }}
            />
            <AngularRateField
              caption="Разброс залпа, °"
              radians={weapon.burstSpreadRadians}
              onChange={(burstSpreadRadians) => {
                patchWeapon(kind, weaponIndex, { burstSpreadRadians });
              }}
            />
            <AngularRateField
              caption="Поворот ракеты, °/с"
              radians={weapon.turnRatePerSecond}
              onChange={(turnRatePerSecond) => {
                patchWeapon(kind, weaponIndex, { turnRatePerSecond });
              }}
            />
            <NumberField
              caption="Масштаб снаряда"
              step={0.1}
              min={0.2}
              value={weapon.visual?.modelScale ?? 1}
              onChange={(modelScale) => {
                patchWeapon(kind, weaponIndex, {
                  visual: scaleEntityVisual(weapon.visual, modelScale)
                });
              }}
            />
          </div>
          <AssetPicker
            label="Вид снаряда"
            value={weapon.visual?.shape ?? null}
            categories={["missile", "weapon"]}
            allowNone
            onChange={(shape) => {
              patchWeapon(kind, weaponIndex, {
                visual:
                  shape === null ? null : { shape, modelScale: weapon.visual?.modelScale ?? 1 }
              });
            }}
          />
          <p className="screen__hint">
            {rangeHint(weapon, archetype.preferredDistance, tuning.cameraViewWidth)}
          </p>
        </div>
      ))}
    </>
  );
}
