import type { BalanceTuning, HelmTuning } from "@spaceship-defender/protocol";

import { DegreesField, PercentField } from "../../components/fields.js";

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
          <dt>Встречное торможение</dt>
          <dd>
            насколько запрос уходит за нос назад в момент отпускания клавиши. Гасит выбег от сетевой
            задержки; слишком большое значение дёрнет корпус в обратную сторону
          </dd>
          <dt>Тяга разворота на месте</dt>
          <dd>
            доля полного газа, на которой корабль крутится без двигателя. Нулём быть не может: курс
            задаётся направлением вектора, а нулевой вектор корпус не поворачивает
          </dd>
        </dl>
      </details>

      <div className="grid">
        <DegreesField
          caption="Опережение курса"
          radians={tuning.helm.headingLeadRadians}
          onChange={(headingLeadRadians) => {
            patch({ headingLeadRadians });
          }}
        />
        <DegreesField
          caption="Встречное торможение"
          radians={tuning.helm.stopCounterRadians}
          onChange={(stopCounterRadians) => {
            patch({ stopCounterRadians });
          }}
        />
        <PercentField
          caption="Тяга разворота на месте"
          fraction={tuning.helm.rotateInPlaceThrottle}
          onChange={(rotateInPlaceThrottle) => {
            patch({ rotateInPlaceThrottle });
          }}
        />
      </div>
    </section>
  );
}
