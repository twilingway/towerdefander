import {
  AUTOPILOT_LEVELS,
  type AutopilotLevel,
  type AutopilotProfile,
  type BalanceTuning
} from "@spaceship-defender/protocol";

import {
  DegreesField,
  DelayField,
  NumberField,
  PercentField,
  SecondsField
} from "../../components/fields.js";

interface AutopilotScreenProps {
  readonly tuning: BalanceTuning;
  readonly onChange: (tuning: BalanceTuning) => void;
}

const AUTOPILOT_LEVEL_LABELS: Record<AutopilotLevel, string> = {
  rookie: "Новичок",
  veteran: "Ветеран",
  ace: "Ас"
};

const AUTOPILOT_LEVEL_HINTS: Record<AutopilotLevel, string> = {
  rookie:
    "Кружит по арене, палит во всё подряд и держит щит, пока есть энергия. Замерено: медиана 7 волны.",
  veteran:
    "Летает как ас, но целится хуже, не уходит от пуль и бережёт нагрев. Замерено: медиана 9 волны.",
  ace: "Стреляет с полным упреждением, уклоняется от пуль и поднимает щит заранее. Замерено: медиана 10 волны."
};

/**
 * The demo autopilot. Nothing here reaches the simulation: these numbers drive
 * the bot that plays the visible demo, so an operator can watch one wave
 * through a weaker or a sharper pilot.
 */
export function AutopilotScreen({ tuning, onChange }: AutopilotScreenProps) {
  const patchProfile = (level: AutopilotLevel, values: Partial<AutopilotProfile>): void => {
    onChange({
      ...tuning,
      autopilot: {
        ...tuning.autopilot,
        profiles: {
          ...tuning.autopilot.profiles,
          [level]: { ...tuning.autopilot.profiles[level], ...values }
        }
      }
    });
  };

  return (
    <section className="screen">
      <header className="screen__header">
        <h2>Автопилот демонстрации</h2>
        <p className="screen__hint">
          Эти числа не влияют на игру: по ним ведёт бой демонстрационный автопилот. Уровень читается
          при запуске демонстрации, поэтому идущий прогон его не подхватывает.
        </p>
      </header>

      <p className="screen__hint">
        Числа в профилях не выдуманы: их подобрал перебор по каждому полю — сто прогонов на значение
        и проверка на двух других блоках сидов. Замеры записаны в подсказки полей ниже; где
        подсказки нет, текущее значение и есть лучшее из проверенных. Мерилось на этом пресете и на
        этой турели, поэтому после смены вида оружия перебор стоит повторить.
      </p>

      <details className="legend">
        <summary>Что значат поля</summary>
        <dl className="legend__list">
          <dt>Задержка реакции</dt>
          <dd>
            сколько новая цель должна продержаться лучшей, прежде чем бот на неё переключится; без
            задержки нос мечется между равными целями. <b>Замерено:</b> 1.0 с — лучшее; 0.05 с стоит
            около волны, 2.0 с уже чуть хуже 1.0 с
          </dd>
          <dt>Пересмотр цели</dt>
          <dd>
            как часто бот вообще готов сменить цель, даже если появилась более важная.
            <b> Замерено:</b> 1.5 с — лучшее; 0.1 с стоит около волны, дальше 1.5 с прибавки нет
          </dd>
          <dt>Разброс прицела</dt>
          <dd>случайная ошибка наведения; она сеяная, поэтому прогон воспроизводится</dd>
          <dt>Доля упреждения</dt>
          <dd>0 — стреляет в текущую точку цели, 100 — в точку встречи по её скорости</dd>
          <dt>Конус пулемёта</dt>
          <dd>
            отклонение от носа, внутри которого пулемёт открывает огонь; нос, тяга и ствол — одна
            величина, поэтому узкий конус заставляет бота доворачивать корпус
          </dd>
          <dt>Конус пушки</dt>
          <dd>
            то же для башни: снаряд уходит по её фактическому углу, а разворот на полкруга занимает
            около двух с половиной секунд
          </dd>
          <dt>Потолок нагрева</dt>
          <dd>доля ёмкости, выше которой бот прекращает огонь, чтобы не словить перегрев</dd>
          <dt>Опережение щита</dt>
          <dd>
            за сколько до предсказанного попадания поднимается щит; после контакта он опускается
          </dd>
          <dt>Запас энергии щита</dt>
          <dd>
            доля ёмкости, ниже которой щит не поднимается вовсе; на нуле щит защёлкивается до явного
            выключения
          </dd>
          <dt>Горизонт уклонения</dt>
          <dd>
            насколько вперёд бот ищет попадание, от которого щит его не закроет. Читается только при
            включённом уклонении хотя бы от ракет или от пуль
          </dd>
          <dt>Дистанция боя</dt>
          <dd>
            радиус кольца, по которому бот обходит приоритетную цель. Читается только при включённом
            обходе и ограничивается кадром камеры: цель, которую бот держит дальше, чем видно на
            экране, он теряет из виду
          </dd>
        </dl>
      </details>

      <article className="card">
        <h3 className="card__subtitle">Активный уровень</h3>
        <div className="card__grid">
          <label className="field">
            <span className="field__caption">Уровень</span>
            <select
              className="field__input"
              value={tuning.autopilot.level}
              onChange={(event) => {
                onChange({
                  ...tuning,
                  autopilot: { ...tuning.autopilot, level: event.target.value as AutopilotLevel }
                });
              }}
            >
              {AUTOPILOT_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {AUTOPILOT_LEVEL_LABELS[level]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="screen__hint">{AUTOPILOT_LEVEL_HINTS[tuning.autopilot.level]}</p>
      </article>

      {AUTOPILOT_LEVELS.map((level) => {
        const profile = tuning.autopilot.profiles[level];
        return (
          <article className="card" key={level}>
            <h3 className="card__subtitle">{AUTOPILOT_LEVEL_LABELS[level]}</h3>
            <p className="screen__hint">{AUTOPILOT_LEVEL_HINTS[level]}</p>

            <h4 className="card__subtitle">Точность и реакция</h4>
            <div className="card__grid">
              <DelayField
                caption="Задержка реакции, с"
                ticks={profile.reactionTicks}
                onChange={(reactionTicks) => {
                  patchProfile(level, { reactionTicks });
                }}
              />
              <SecondsField
                caption="Пересмотр цели, с"
                ticks={profile.retargetIntervalTicks}
                onChange={(retargetIntervalTicks) => {
                  patchProfile(level, { retargetIntervalTicks });
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

            <h4 className="card__subtitle">Умения</h4>
            <div className="card__grid">
              <label className="field field--inline">
                <input
                  type="checkbox"
                  checked={profile.orbit}
                  onChange={(event) => {
                    patchProfile(level, { orbit: event.target.checked });
                  }}
                />
                <span className="field__caption">Держать дистанцию и обходить цель</span>
              </label>
              <label className="field field--inline">
                <input
                  type="checkbox"
                  checked={profile.evadeMissiles}
                  onChange={(event) => {
                    patchProfile(level, { evadeMissiles: event.target.checked });
                  }}
                />
                <span className="field__caption">Уходить от ракет</span>
              </label>
              <label className="field field--inline">
                <input
                  type="checkbox"
                  checked={profile.dodgeBullets}
                  onChange={(event) => {
                    patchProfile(level, { dodgeBullets: event.target.checked });
                  }}
                />
                <span className="field__caption">Уходить от пуль и астероидов</span>
              </label>
              <label className="field field--inline">
                <input
                  type="checkbox"
                  checked={profile.threatAwareShield}
                  onChange={(event) => {
                    patchProfile(level, { threatAwareShield: event.target.checked });
                  }}
                />
                <span className="field__caption">Щит по угрозе, а не по энергии</span>
              </label>
              <NumberField
                caption="Дистанция боя"
                step={20}
                min={200}
                disabled={!profile.orbit}
                value={profile.standoffDistance}
                onChange={(standoffDistance) => {
                  patchProfile(level, { standoffDistance });
                }}
              />
              <DelayField
                caption="Горизонт уклонения, с"
                disabled={!profile.evadeMissiles && !profile.dodgeBullets}
                ticks={profile.evadeHorizonTicks}
                onChange={(evadeHorizonTicks) => {
                  patchProfile(level, { evadeHorizonTicks });
                }}
              />
            </div>

            <h4 className="card__subtitle">Дисциплина ресурсов</h4>
            <div className="card__grid">
              <DegreesField
                caption="Конус пулемёта, °"
                radians={profile.mgConeRadians}
                onChange={(mgConeRadians) => {
                  patchProfile(level, { mgConeRadians });
                }}
              />
              <DegreesField
                caption="Конус пушки, °"
                radians={profile.cannonConeRadians}
                onChange={(cannonConeRadians) => {
                  patchProfile(level, { cannonConeRadians });
                }}
              />
              <PercentField
                caption="Потолок нагрева пулемёта, %"
                fraction={profile.mgHeatCeiling}
                onChange={(mgHeatCeiling) => {
                  patchProfile(level, { mgHeatCeiling });
                }}
              />
              <PercentField
                caption="Потолок нагрева пушки, %"
                fraction={profile.cannonHeatCeiling}
                onChange={(cannonHeatCeiling) => {
                  patchProfile(level, { cannonHeatCeiling });
                }}
              />
              <DelayField
                caption="Опережение щита, с"
                ticks={profile.shieldLeadTicks}
                onChange={(shieldLeadTicks) => {
                  patchProfile(level, { shieldLeadTicks });
                }}
              />
              <PercentField
                caption="Запас энергии щита, %"
                fraction={profile.shieldMinEnergy}
                onChange={(shieldMinEnergy) => {
                  patchProfile(level, { shieldMinEnergy });
                }}
              />
            </div>
          </article>
        );
      })}
    </section>
  );
}
