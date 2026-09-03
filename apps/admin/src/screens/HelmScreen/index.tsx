import {
  HELM_SCHEMES,
  type BalanceTuning,
  type HelmScheme,
  type HelmTuning
} from "@spaceship-defender/protocol";

import { DegreesField, NumberField, PercentField } from "../../components/fields.js";

const SCHEME_LABELS: Record<HelmScheme, string> = {
  tank: "Танковый руль",
  absolute: "Абсолютное направление"
};

const SCHEME_HINTS: Record<HelmScheme, string> = {
  tank: "A и D вращают корпус, W даёт тягу вдоль носа. Нос сам и есть прицел пулемёта.",
  absolute: "Клавиши задают направление в мире, корабль идёт туда, а нос доворачивает следом."
};

interface HelmScreenProps {
  readonly tuning: BalanceTuning;
  readonly onChange: (tuning: BalanceTuning) => void;
}

/**
 * Feel of the keyboard helm. Nothing here reaches the simulation: these numbers
 * shape what the controller sends, so a run picks them up at its start and the
 * physics of the hull stay where they are, on the player tab.
 */
export function HelmScreen({ tuning, onChange }: HelmScreenProps) {
  const patch = (values: Partial<HelmTuning>): void => {
    onChange({ ...tuning, helm: { ...tuning.helm, ...values } });
  };

  return (
    <section className="screen">
      <header className="screen__header">
        <h2>Управление с клавиатуры</h2>
        <p className="screen__hint">
          Эти числа меняют ощущение руля, а не физику корабля: скорость разворота и жёсткость
          остановки задаются тем, какой курс контроллер просит у сервера. Идущий прогон их не
          подхватывает — значения читаются при старте.
        </p>
      </header>

      <details className="legend">
        <summary>Что значат поля</summary>
        <dl className="legend__list">
          <dt>Опережение курса</dt>
          <dd>
            насколько запрашиваемый курс держится впереди носа, пока нажата клавиша доворота. Корпус
            догоняет цель тем быстрее, чем она дальше, поэтому этот угол и задаёт скорость
            разворота: больше — резвее, но и выбег после отпускания длиннее
          </dd>
          <dt>Демпфирование остановки</dt>
          <dd>
            множитель к предсказанной точке, где вращение встанет само. 1 — корпус останавливается
            там, куда его довели; меньше — тормозит раньше и слегка качается назад; больше — уезжает
            чуть дальше
          </dd>
          <dt>Тяга разворота на месте</dt>
          <dd>
            доля полного газа, на которой корабль крутится без двигателя. Нулём быть не может: курс
            задаётся направлением вектора, а нулевой вектор корпус не поворачивает
          </dd>
        </dl>
      </details>

      <div className="grid">
        <label className="field">
          <span className="field__caption">Схема</span>
          <select
            className="field__input"
            value={tuning.helm.scheme}
            onChange={(event) => {
              patch({ scheme: event.target.value as HelmScheme });
            }}
          >
            {HELM_SCHEMES.map((scheme) => (
              <option key={scheme} value={scheme}>
                {SCHEME_LABELS[scheme]}
              </option>
            ))}
          </select>
        </label>
        <DegreesField
          caption="Опережение курса, °"
          radians={tuning.helm.headingLeadRadians}
          onChange={(headingLeadRadians) => {
            patch({ headingLeadRadians });
          }}
        />
        <NumberField
          caption="Демпфирование остановки, ×"
          value={tuning.helm.stopDampening}
          step={0.05}
          min={0.5}
          onChange={(stopDampening) => {
            patch({ stopDampening });
          }}
        />
        <PercentField
          caption="Тяга разворота на месте, %"
          fraction={tuning.helm.rotateInPlaceThrottle}
          onChange={(rotateInPlaceThrottle) => {
            patch({ rotateInPlaceThrottle });
          }}
        />
      </div>

      <p className="screen__hint">{SCHEME_HINTS[tuning.helm.scheme]}</p>
    </section>
  );
}
