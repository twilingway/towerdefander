import {
  ENEMY_ARCHETYPE_ID_PATTERN,
  ENEMY_SKILL_LEVELS,
  MAX_ENEMY_ARCHETYPES,
  MAX_ENEMY_WEAPONS,
  type BalanceTuning,
  type EnemyArchetype,
  type EnemySkillLevel
} from "@spaceship-defender/protocol";

import { AssetPicker } from "../../AssetPicker.js";
import { EnemyPreview } from "../../EnemyPreview.js";
import { DegreesField, NumberField, PercentField } from "../../components/fields.js";
import { ENEMY_SKILL_LEVEL_LABELS } from "../../model/enemySkillLabels.js";
import { nextArchetypeId, usageOf } from "./catalogue.js";
import { WeaponEditor } from "./WeaponEditor.js";

interface ArchetypeCardProps {
  readonly kind: string;
  readonly archetype: EnemyArchetype;
  readonly tuning: BalanceTuning;
  readonly onChange: (tuning: BalanceTuning) => void;
}

/** One catalogue entry: identity, combat stats, visual and weapons. */
export function ArchetypeCard({ kind, archetype, tuning, onChange }: ArchetypeCardProps) {
  const catalogue = Object.keys(tuning.enemyArchetypes).sort();
  const usedIn = usageOf(tuning, kind);

  const archetypeOf = (kind: string): EnemyArchetype | undefined => tuning.enemyArchetypes[kind];

  const patchArchetype = (kind: string, patch: Partial<EnemyArchetype>): void => {
    const current = archetypeOf(kind);
    if (current === undefined) return;
    onChange({
      ...tuning,
      enemyArchetypes: { ...tuning.enemyArchetypes, [kind]: { ...current, ...patch } }
    });
  };

  const patchWeapon = (
    kind: string,
    weaponIndex: number,
    patch: Partial<EnemyArchetype["weapons"][number]>
  ): void => {
    const current = archetypeOf(kind);
    if (current === undefined) return;
    patchArchetype(kind, {
      weapons: current.weapons.map((weapon, index) =>
        index === weaponIndex ? { ...weapon, ...patch } : weapon
      )
    });
  };

  const addWeapon = (kind: string): void => {
    const current = archetypeOf(kind);
    if (current === undefined || current.weapons.length >= MAX_ENEMY_WEAPONS) return;
    const last = current.weapons[current.weapons.length - 1];
    if (last === undefined) return;
    patchArchetype(kind, { weapons: [...current.weapons, { ...last }] });
  };

  const removeWeapon = (kind: string, weaponIndex: number): void => {
    const current = archetypeOf(kind);
    if (current === undefined || current.weapons.length === 1) return;
    patchArchetype(kind, {
      weapons: current.weapons.filter((_, index) => index !== weaponIndex)
    });
  };

  const patchVisual = (kind: string, patch: Partial<EnemyArchetype["visual"]>): void => {
    const current = archetypeOf(kind);
    if (current === undefined) return;
    patchArchetype(kind, { visual: { ...current.visual, ...patch } });
  };

  const cloneArchetype = (kind: string): void => {
    const source = archetypeOf(kind);
    if (source === undefined || catalogue.length >= MAX_ENEMY_ARCHETYPES) return;
    const id = nextArchetypeId(tuning, kind);
    onChange({
      ...tuning,
      enemyArchetypes: {
        ...tuning.enemyArchetypes,
        [id]: { ...source, label: `${source.label} (копия)` }
      }
    });
  };

  const removeArchetype = (kind: string): void => {
    const rest = Object.fromEntries(
      Object.entries(tuning.enemyArchetypes).filter(([id]) => id !== kind)
    );
    onChange({ ...tuning, enemyArchetypes: rest });
  };

  const renameArchetype = (kind: string, nextId: string): void => {
    const source = archetypeOf(kind);
    if (source === undefined || nextId === kind) return;
    if (!ENEMY_ARCHETYPE_ID_PATTERN.test(nextId)) return;
    if (Object.hasOwn(tuning.enemyArchetypes, nextId)) return;
    const renamed = Object.fromEntries(
      Object.entries(tuning.enemyArchetypes).map(([id, archetype]) =>
        id === kind ? [nextId, archetype] : [id, archetype]
      )
    );
    onChange({
      ...tuning,
      enemyArchetypes: renamed,
      waveCampaign: {
        ...tuning.waveCampaign,
        waves: tuning.waveCampaign.waves.map((wave) => ({
          ...wave,
          entries: wave.entries.map((entry) =>
            entry.kind === kind ? { ...entry, kind: nextId } : entry
          )
        }))
      }
    });
  };

  return (
    <article className="card" key={kind}>
      <header className="card__head">
        <input
          className="field__input card__name"
          value={archetype.label}
          aria-label="Название"
          onChange={(event) => {
            patchArchetype(kind, { label: event.target.value });
          }}
        />
        <input
          className="field__input card__id"
          value={kind}
          aria-label="Идентификатор"
          spellCheck={false}
          onChange={(event) => {
            renameArchetype(kind, event.target.value);
          }}
        />
        <button
          className="button"
          type="button"
          disabled={catalogue.length >= MAX_ENEMY_ARCHETYPES}
          onClick={() => {
            cloneArchetype(kind);
          }}
        >
          Копия
        </button>
        <button
          className="button button--ghost"
          type="button"
          disabled={usedIn.length > 0 || catalogue.length === 1}
          title={
            usedIn.length > 0 ? `Используется в волнах: ${usedIn.join(", ")}` : "Удалить архетип"
          }
          onClick={() => {
            removeArchetype(kind);
          }}
        >
          Удалить
        </button>
      </header>
      {usedIn.length > 0 ? (
        <p className="card__usage">В таблице волн: {usedIn.join(", ")}</p>
      ) : null}

      <h4 className="card__subtitle">Внешний вид</h4>
      <div className="appearance">
        <EnemyPreview archetype={archetype} />
        <div className="appearance__controls">
          <AssetPicker
            label="Силуэт"
            value={archetype.visual.shape}
            categories={["ship", "station", "drone", "boss"]}
            onChange={(shape) => {
              if (shape !== null) patchVisual(kind, { shape });
            }}
          />
          <div className="card__grid">
            <label className="field field--inline">
              <input
                type="checkbox"
                checked={archetype.visual.showHealthBar}
                onChange={(event) => {
                  patchVisual(kind, { showHealthBar: event.target.checked });
                }}
              />
              <span className="field__caption">Полоса HP над корпусом</span>
            </label>
            <NumberField
              caption="Радиус поражения"
              value={archetype.radius}
              onChange={(radius) => {
                patchArchetype(kind, { radius });
              }}
            />
            <NumberField
              caption="Масштаб модели"
              step={0.1}
              min={0.2}
              value={archetype.visual.modelScale}
              onChange={(modelScale) => {
                patchVisual(kind, {
                  modelScale: Math.min(4, Math.max(0.2, modelScale))
                });
              }}
            />
          </div>
        </div>
      </div>

      <h4 className="card__subtitle">Характеристики</h4>
      <div className="card__grid">
        <NumberField
          caption="HP"
          value={archetype.hp}
          onChange={(hp) => {
            patchArchetype(kind, { hp });
          }}
        />
        <NumberField
          caption="Скорость"
          value={archetype.speedPerSecond}
          onChange={(speedPerSecond) => {
            patchArchetype(kind, { speedPerSecond });
          }}
        />
        <NumberField
          caption="Дистанция"
          value={archetype.preferredDistance}
          onChange={(preferredDistance) => {
            patchArchetype(kind, { preferredDistance });
          }}
        />
        <DegreesField
          caption="Поворот, °/с"
          radians={archetype.turnRatePerSecond}
          onChange={(turnRatePerSecond) => {
            // Acceleration and braking follow the top rate at the same
            // 2x / 3x the player's hull uses, so one knob keeps the
            // whole momentum profile of a ship consistent.
            patchArchetype(kind, {
              turnRatePerSecond,
              turnAccelerationPerSecondSquared: turnRatePerSecond * 2,
              turnBrakingPerSecondSquared: turnRatePerSecond * 3
            });
          }}
        />
        <NumberField
          caption="Цена спавна"
          value={archetype.spawnCost}
          onChange={(spawnCost) => {
            patchArchetype(kind, { spawnCost });
          }}
        />
        <NumberField
          caption="Волна разблокировки"
          min={1}
          value={archetype.unlockWave}
          onChange={(unlockWave) => {
            patchArchetype(kind, { unlockWave: Math.max(1, Math.round(unlockWave)) });
          }}
        />
        <label className="field">
          <span className="field__caption">Появление</span>
          <select
            className="field__input"
            value={archetype.spawnPolicy}
            onChange={(event) => {
              patchArchetype(kind, {
                spawnPolicy: event.target.value === "boss" ? "boss" : "standard"
              });
            }}
          >
            <option value="standard">в общем потоке волны</option>
            <option value="boss">после зачистки волны</option>
          </select>
        </label>
        <label className="field">
          <span className="field__caption">Мастерство</span>
          <select
            className="field__input"
            value={archetype.combatSkill}
            onChange={(event) => {
              patchArchetype(kind, { combatSkill: event.target.value as EnemySkillLevel });
            }}
          >
            {ENEMY_SKILL_LEVELS.map((level) => (
              <option key={level} value={level}>
                {ENEMY_SKILL_LEVEL_LABELS[level]}
              </option>
            ))}
          </select>
        </label>
        <NumberField
          caption="Очки"
          value={archetype.scoreReward}
          onChange={(scoreReward) => {
            patchArchetype(kind, { scoreReward });
          }}
        />
        <NumberField
          caption="Кредиты"
          value={archetype.creditReward}
          onChange={(creditReward) => {
            patchArchetype(kind, { creditReward });
          }}
        />
        <PercentField
          caption="Шанс лута"
          fraction={archetype.lootChance}
          onChange={(lootChance) => {
            patchArchetype(kind, { lootChance });
          }}
        />
      </div>
      <WeaponEditor
        kind={kind}
        archetype={archetype}
        tuning={tuning}
        addWeapon={addWeapon}
        removeWeapon={removeWeapon}
        patchWeapon={patchWeapon}
      />
    </article>
  );
}
