import {
  MAX_ENEMY_ARCHETYPES,
  type BalanceTuning,
  type EnemyArchetype
} from "@spaceship-defender/protocol";

import { ArchetypeCard } from "./ArchetypeCard.js";
import { nextArchetypeId } from "./catalogue.js";
import { ParameterLegend } from "./ParameterLegend.js";

interface EnemiesScreenProps {
  readonly tuning: BalanceTuning;
  readonly onChange: (tuning: BalanceTuning) => void;
}

export function EnemiesScreen({ tuning, onChange }: EnemiesScreenProps) {
  const catalogue = Object.keys(tuning.enemyArchetypes).sort();

  const archetypeOf = (kind: string): EnemyArchetype | undefined => tuning.enemyArchetypes[kind];

  const createArchetype = (): void => {
    if (catalogue.length >= MAX_ENEMY_ARCHETYPES) return;
    const id = nextArchetypeId(tuning, "enemy");
    onChange({
      ...tuning,
      enemyArchetypes: {
        ...tuning.enemyArchetypes,
        [id]: {
          hp: 60,
          radius: 26,
          speedPerSecond: 160,
          preferredDistance: 600,
          turnRatePerSecond: (2 * Math.PI) / 3,
          turnAccelerationPerSecondSquared: (4 * Math.PI) / 3,
          turnBrakingPerSecondSquared: 2 * Math.PI,
          combatSkill: "veteran",
          weapons: [
            {
              kind: "bullet",
              cooldownTicks: 30,
              damage: 10,
              shieldHitCost: 4,
              projectileRadius: 7,
              projectileSpeedPerSecond: 440,
              projectileLifetimeTicks: 180,
              engagementRange: 1200,
              turnRatePerSecond: Math.PI / 2,
              burstCount: 1,
              burstSpreadRadians: 0,
              visual: null
            }
          ],
          visual: {
            shape: "ship-arrowhead",
            modelScale: 1,
            showHealthBar: false
          },
          label: "Новый враг",
          spawnPolicy: "standard",
          spawnCost: 2,
          unlockWave: 1,
          scoreReward: 20,
          creditReward: 2
        }
      }
    });
  };

  return (
    <section className="screen">
      <header className="screen__header">
        <h2>Архетипы врагов</h2>
        <p className="screen__hint">
          Стоимость спавна и волна разблокировки влияют и на таблицу волн, и на директора. Тип с
          появлением «после зачистки волны» выходит из общего пула директора: он приходит последним
          и только когда все остальные угрозы волны уничтожены, а сама волна выбирается интервалом
          босс-волн.
        </p>
      </header>

      <div className="row">
        <button
          className="button button--primary"
          type="button"
          disabled={catalogue.length >= MAX_ENEMY_ARCHETYPES}
          onClick={createArchetype}
        >
          + добавить врага
        </button>
        <span className="screen__hint">
          В каталоге {catalogue.length} из {MAX_ENEMY_ARCHETYPES}
        </span>
      </div>

      <ParameterLegend />

      <div className="cards">
        {catalogue.map((kind) => {
          const archetype = archetypeOf(kind);
          if (archetype === undefined) return null;
          return (
            <ArchetypeCard
              key={kind}
              kind={kind}
              archetype={archetype}
              tuning={tuning}
              onChange={onChange}
            />
          );
        })}
      </div>
    </section>
  );
}
