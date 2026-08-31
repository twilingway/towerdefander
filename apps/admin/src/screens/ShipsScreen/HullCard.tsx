import {
  CREW_ROLES,
  MODULE_TARGET_FIELDS,
  MODULE_TARGET_LABELS,
  MODULE_TIER_WIDTHS,
  type FriendlyWeaponKind,
  type ModuleTargetField,
  type ShipArchetype,
  type ShipModule
} from "@spaceship-defender/protocol";

import { AssetPicker } from "../../AssetPicker.js";
import { NumberField, WeaponKindField } from "../../components/fields.js";
import { ModuleEditor } from "./ModuleEditor.js";

interface HullCardProps {
  readonly id: string;
  readonly hull: ShipArchetype;
  readonly isDefault: boolean;
  readonly canRemove: boolean;
  readonly onChange: (hull: ShipArchetype) => void;
  readonly onMakeDefault: () => void;
  readonly onRemove: () => void;
}

/** The seats a tier owes, by how wide it is; the schema refuses anything less. */
function requiredRoles(width: number): number {
  return width >= 3 ? CREW_ROLES.length : Math.min(2, width);
}

function coveredRoles(tier: readonly ShipModule[]): number {
  return new Set(tier.map(({ role }) => role)).size;
}

export function HullCard({
  id,
  hull,
  isDefault,
  canRemove,
  onChange,
  onMakeDefault,
  onRemove
}: HullCardProps) {
  const overrides = hull.overrides;
  const overriddenStats = Object.keys(overrides.stats) as ModuleTargetField[];

  const patchTier = (tierIndex: number, moduleIndex: number, module: ShipModule): void => {
    onChange({
      ...hull,
      tiers: hull.tiers.map((tier, at) =>
        at === tierIndex
          ? tier.map((current, slot) => (slot === moduleIndex ? module : current))
          : tier
      )
    });
  };

  return (
    <article className="card">
      <header className="card__header">
        <h3 className="card__subtitle">
          {hull.label} · {id}
        </h3>
        <div className="card__actions">
          {!isDefault && (
            <button type="button" className="button button--ghost" onClick={onMakeDefault}>
              Сделать базовым
            </button>
          )}
          {canRemove && !isDefault && (
            <button type="button" className="button button--ghost" onClick={onRemove}>
              Удалить корпус
            </button>
          )}
        </div>
      </header>

      <div className="card__grid">
        <label className="field">
          <span className="field__caption">Название</span>
          <input
            className="field__input"
            value={hull.label}
            maxLength={48}
            onChange={(event) => {
              onChange({ ...hull, label: event.target.value });
            }}
          />
        </label>
        <label className="field">
          <span className="field__caption">Описание для экрана выбора</span>
          <input
            className="field__input"
            value={hull.description}
            maxLength={240}
            onChange={(event) => {
              onChange({ ...hull, description: event.target.value });
            }}
          />
        </label>
        <NumberField
          caption="Открывается на волне"
          step={1}
          min={1}
          value={hull.unlockedAtWave}
          onChange={(unlockedAtWave) => {
            onChange({ ...hull, unlockedAtWave });
          }}
        />
      </div>

      <AssetPicker
        label="Силуэт корпуса"
        value={hull.visual?.shape ?? null}
        categories={["ship"]}
        allowNone
        onChange={(shape) => {
          onChange({
            ...hull,
            visual: shape === null ? null : { shape, modelScale: hull.visual?.modelScale ?? 1 }
          });
        }}
      />

      <h4 className="card__subtitle">Отличия от базового корабля</h4>
      <p className="screen__hint">
        Разреженный список: корпус называет только то, чем отличается, поэтому правка базового числа
        на вкладке «Игрок» доходит до всех корпусов, которые её не переопределили. У базового
        корпуса этот список пуст — прогон на нём и есть прогон без корпусов.
      </p>
      <div className="card__grid">
        <WeaponKindField
          caption="Турель"
          value={overrides.cannonWeaponKind ?? "kinetic"}
          onChange={(cannonWeaponKind: FriendlyWeaponKind) => {
            onChange({ ...hull, overrides: { ...overrides, cannonWeaponKind } });
          }}
        />
        <WeaponKindField
          caption="Носовой ствол"
          value={overrides.mgWeaponKind ?? "kinetic"}
          onChange={(mgWeaponKind: FriendlyWeaponKind) => {
            onChange({ ...hull, overrides: { ...overrides, mgWeaponKind } });
          }}
        />
      </div>
      {overriddenStats.map((field) => (
        <div className="card__grid" key={field}>
          <NumberField
            caption={MODULE_TARGET_LABELS[field]}
            step={1}
            value={overrides.stats[field] ?? 0}
            onChange={(value) => {
              onChange({
                ...hull,
                overrides: { ...overrides, stats: { ...overrides.stats, [field]: value } }
              });
            }}
          />
          <button
            type="button"
            className="button button--ghost"
            onClick={() => {
              const stats = Object.fromEntries(
                Object.entries(overrides.stats).filter(([candidate]) => candidate !== field)
              );
              onChange({ ...hull, overrides: { ...overrides, stats } });
            }}
          >
            Вернуть базовое
          </button>
        </div>
      ))}
      <label className="field">
        <span className="field__caption">Переопределить ещё одно поле</span>
        <select
          className="field__input"
          value=""
          onChange={(event) => {
            const field = event.target.value as ModuleTargetField;
            if (field.length === 0) return;
            onChange({
              ...hull,
              overrides: { ...overrides, stats: { ...overrides.stats, [field]: 0 } }
            });
          }}
        >
          <option value="">—</option>
          {MODULE_TARGET_FIELDS.filter((field) => !Object.hasOwn(overrides.stats, field)).map(
            (field) => (
              <option key={field} value={field}>
                {MODULE_TARGET_LABELS[field]}
              </option>
            )
          )}
        </select>
      </label>

      <h4 className="card__subtitle">Дерево модулей</h4>
      <p className="screen__hint">
        Десять тиров шириной {MODULE_TIER_WIDTHS.join(", ")} — форму задаёт код, содержимое вы.
        Экипаж видит тир целиком и покупает из него один модуль, поэтому тир из трёх и больше обязан
        покрывать все три роли, а из двух — хотя бы две. Пресет, который это нарушает, сервер не
        примет.
      </p>
      {hull.tiers.map((tier, tierIndex) => {
        const covered = coveredRoles(tier);
        const owed = requiredRoles(tier.length);
        return (
          <details className="tier" key={`tier-${String(tierIndex)}`}>
            <summary>
              Тир {tierIndex + 1} · {tier.length} шт. · ролей {covered} из {owed}
              {covered < owed ? " — не хватает роли" : ""}
            </summary>
            {tier.map((module, moduleIndex) => (
              <ModuleEditor
                key={`${module.id}-${String(moduleIndex)}`}
                module={module}
                onChange={(next) => {
                  patchTier(tierIndex, moduleIndex, next);
                }}
              />
            ))}
          </details>
        );
      })}

      <details className="tier">
        <summary>Повторяемый хвост · {hull.endlessTier.length} шт.</summary>
        <p className="screen__hint">
          Предлагается на каждой передышке после десятого тира и покупается сколько угодно раз,
          поэтому здесь уместны прибавки и проценты, а не переключатели.
        </p>
        {hull.endlessTier.map((module, moduleIndex) => (
          <ModuleEditor
            key={`${module.id}-${String(moduleIndex)}`}
            module={module}
            onChange={(next) => {
              onChange({
                ...hull,
                endlessTier: hull.endlessTier.map((current, slot) =>
                  slot === moduleIndex ? next : current
                )
              });
            }}
          />
        ))}
      </details>
    </article>
  );
}
