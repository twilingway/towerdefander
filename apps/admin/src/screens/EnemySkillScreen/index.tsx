import {
  ENEMY_SKILL_LEVELS,
  type BalanceTuning,
  type EnemySkillLevel,
  type EnemySkillProfile
} from "@spaceship-defender/protocol";

import { DegreesField, DelayField, NumberField, PercentField } from "../../components/fields.js";
import { ENEMY_SKILL_LEVEL_LABELS } from "../../model/enemySkillLabels.js";

interface EnemySkillScreenProps {
  readonly tuning: BalanceTuning;
  readonly onChange: (tuning: BalanceTuning) => void;
}

const ENEMY_SKILL_LEVEL_HINTS: Record<EnemySkillLevel, string> = {
  rookie: "Стреляет в текущую точку корабля, толпится с одной стороны и дерётся до конца.",
  veteran: "Берёт упреждение, расходится по кругу и отходит подранком.",
  ace: "Бьёт без разброса с полным упреждением, уклоняется от очередей и держит строй."
};

/** Difficulty is a whole step, not a slider: the values are only ever these. */
const OFFSETS = [-2, -1, 0, 1, 2] as const;
const OFFSET_LABELS: Record<number, string> = {
  [-2]: "−2 — на два уровня легче",
  [-1]: "−1 — на уровень легче",
  0: "0 — как задано в каталоге",
  1: "+1 — на уровень сложнее",
  2: "+2 — на два уровня сложнее"
};

/**
 * How well enemies play, as opposed to what they are. One algorithm reads these
 * numbers, so levels differ by values and never by code — two of them can be
 * put side by side and compared.
 */
export function EnemySkillScreen({ tuning, onChange }: EnemySkillScreenProps) {
  const patchProfile = (level: EnemySkillLevel, values: Partial<EnemySkillProfile>): void => {
    onChange({
      ...tuning,
      enemySkill: {
        ...tuning.enemySkill,
        profiles: {
          ...tuning.enemySkill.profiles,
          [level]: { ...tuning.enemySkill.profiles[level], ...values }
        }
      }
    });
  };

  return (
    <section className="screen">
      <header className="screen__header">
        <h2>Мастерство врагов</h2>
        <p className="screen__hint">
          Уровень назначается каждому архетипу на вкладке «Враги», а сдвиг ниже двигает весь каталог
          сразу, сохраняя задуманную разницу между перехватчиком и боссом. Бой читает эти числа при
          старте забега, поэтому идущий прогон их не подхватывает.
        </p>
      </header>

      <details className="legend">
        <summary>Что значат поля</summary>
        <dl className="legend__list">
          <dt>Задержка реакции</dt>
          <dd>
            как редко враг заново смотрит, где корабль; между взглядами он ведёт запомненную точку
            по её же скорости, поэтому медленный враг мажет по манёвру, а не по прицелу
          </dd>
          <dt>Разброс прицела</dt>
          <dd>случайная ошибка ствола; она сеяная, поэтому забег воспроизводится</dd>
          <dt>Доля упреждения</dt>
          <dd>
            0 — стреляет туда, где корабль сейчас, 100 — в точку встречи; самая тяжёлая ручка
            набора, потому что без неё ровный боковой ход побеждал вражеский огонь целиком
          </dd>
          <dt>Доля облёта</dt>
          <dd>сколько скорости уходит на кружение вокруг корабля вместо сближения с ним</dd>
          <dt>Полоса дистанции</dt>
          <dd>
            ширина зоны, на которой сближение плавно переходит в облёт; узкая полоса даёт резкую
            смену курса на границе, широкая — вялую
          </dd>
          <dt>Расталкивание</dt>
          <dd>насколько сильно враг отходит от соседа, залезшего ближе суммы радиусов</dd>
          <dt>Развод по кругу</dt>
          <dd>
            насколько охотно враг занимает свой сектор вокруг корабля вместо того, чтобы лететь туда
            же, куда и все
          </dd>
          <dt>Горизонт уклонения</dt>
          <dd>
            за сколько до попадания враг уходит с линии дружественного огня; 0 — не уклоняется
          </dd>
          <dt>Порог отхода</dt>
          <dd>ниже какой доли HP враг начинает драться с дистанции; 0 — дерётся до конца</dd>
          <dt>Дистанция отхода</dt>
          <dd>во сколько раз растёт боевая дистанция подранка</dd>
        </dl>
      </details>

      <article className="card">
        <h3 className="card__subtitle">Сложность</h3>
        <div className="card__grid">
          <label className="field">
            <span className="field__caption">Сдвиг уровня</span>
            <select
              className="field__input"
              value={tuning.enemySkill.offset}
              onChange={(event) => {
                onChange({
                  ...tuning,
                  enemySkill: { ...tuning.enemySkill, offset: Number(event.target.value) }
                });
              }}
            >
              {OFFSETS.map((offset) => (
                <option key={offset} value={offset}>
                  {OFFSET_LABELS[offset]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </article>

      {ENEMY_SKILL_LEVELS.map((level) => {
        const profile = tuning.enemySkill.profiles[level];
        return (
          <article className="card" key={level}>
            <h3 className="card__subtitle">{ENEMY_SKILL_LEVEL_LABELS[level]}</h3>
            <p className="screen__hint">{ENEMY_SKILL_LEVEL_HINTS[level]}</p>

            <h4 className="card__subtitle">Восприятие и точность</h4>
            <div className="card__grid">
              <DelayField
                caption="Задержка реакции, с"
                ticks={profile.reactionTicks}
                onChange={(reactionTicks) => {
                  patchProfile(level, { reactionTicks });
                }}
              />
              <DegreesField
                caption="Разброс прицела, °"
                radians={profile.aimJitterRadians}
                onChange={(aimJitterRadians) => {
                  patchProfile(level, { aimJitterRadians });
                }}
              />
              <PercentField
                caption="Доля упреждения, %"
                fraction={profile.leadFactor}
                onChange={(leadFactor) => {
                  patchProfile(level, { leadFactor });
                }}
              />
            </div>

            <h4 className="card__subtitle">Манёвр</h4>
            <div className="card__grid">
              <PercentField
                caption="Доля облёта, %"
                fraction={profile.orbitShare}
                onChange={(orbitShare) => {
                  patchProfile(level, { orbitShare });
                }}
              />
              <NumberField
                caption="Полоса дистанции, ед."
                value={profile.rangeBandUnits}
                step={10}
                min={20}
                onChange={(rangeBandUnits) => {
                  patchProfile(level, { rangeBandUnits: Math.round(rangeBandUnits) });
                }}
              />
              <PercentField
                caption="Расталкивание, %"
                fraction={profile.separationWeight}
                onChange={(separationWeight) => {
                  patchProfile(level, { separationWeight });
                }}
              />
              <PercentField
                caption="Развод по кругу, %"
                fraction={profile.flankSpread}
                onChange={(flankSpread) => {
                  patchProfile(level, { flankSpread });
                }}
              />
              <DelayField
                caption="Горизонт уклонения, с"
                ticks={profile.evadeHorizonTicks}
                onChange={(evadeHorizonTicks) => {
                  patchProfile(level, { evadeHorizonTicks });
                }}
              />
            </div>

            <h4 className="card__subtitle">Дисциплина</h4>
            <div className="card__grid">
              <PercentField
                caption="Порог отхода, % HP"
                fraction={profile.retreatHpFraction}
                onChange={(retreatHpFraction) => {
                  patchProfile(level, { retreatHpFraction });
                }}
              />
              <NumberField
                caption="Дистанция отхода, ×"
                value={profile.retreatStandoffFactor}
                step={0.1}
                min={1}
                onChange={(retreatStandoffFactor) => {
                  patchProfile(level, { retreatStandoffFactor });
                }}
              />
            </div>
          </article>
        );
      })}
    </section>
  );
}
