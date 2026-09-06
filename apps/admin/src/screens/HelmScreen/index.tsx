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
 * Feel of the helm and the geometry of the sticks. Almost nothing here reaches
 * the simulation: these numbers shape what a client sends, so a run picks them
 * up at its start and the physics of the hull stay on the player tab.
 *
 * The turret mount is the one exception, and it is here rather than on the
 * player tab because an operator asking "how does this thing steer" is asking
 * about it. It says so on its own row.
 */
/**
 * Two of the shares have a floor the schema will not go below, and a percent
 * field cannot express one. Clamping here rather than widening the schema keeps
 * the refusal out of the save button: the console clamps, the server validates.
 */
function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function HelmScreen({ tuning, onChange }: HelmScreenProps) {
  const patch = (values: Partial<HelmTuning>): void => {
    onChange({ ...tuning, helm: { ...tuning.helm, ...values } });
  };

  return (
    <section className="screen">
      <header className="screen__header">
        <h2>Управление</h2>
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
          <dt>Мёртвые зоны стиков</dt>
          <dd>
            доля радиуса кольца, которую палец проходит впустую. Направление при этом насыщается по
            полному радиусу, а сила — по остатку, поэтому стик с мёртвой зоной всё ещё выходит на
            полный газ у самого кольца. Ноль — так вели себя панели экипажа до сих пор
          </dd>
          <dt>Зона захвата стика хода</dt>
          <dd>
            доля ширины экрана, с левого края, касание в которой берёт стик хода. Кольцо остаётся на
            месте — шире становится площадь, куда можно опустить палец не глядя. Читает её только
            соло-кокпит: у панелей экипажа зоны свои
          </dd>
          <dt>Проекция точки прицела</dt>
          <dd>
            как далеко впереди корабля соло-кокпит ставит точку прицела при полном отклонении стика,
            долей большей стороны кадра
          </dd>
          <dt>Башня на корпусе</dt>
          <dd>
            <b>единственное поле этой вкладки, которое читает симуляция.</b> Включено — корпус везёт
            башню с собой, и привод тратится только на разницу, которую запросил наводчик. Выключено
            — башня держит мировой угол, а корпус проворачивается под ней
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

      <h3 className="card__subtitle">Стики</h3>
      <div className="grid">
        <PercentField
          caption="Мёртвая зона стика хода, %"
          fraction={tuning.helm.driveDeadzoneShare}
          onChange={(driveDeadzoneShare) => {
            patch({ driveDeadzoneShare });
          }}
        />
        <PercentField
          caption="Мёртвая зона прицела, %"
          fraction={tuning.helm.aimDeadzoneShare}
          onChange={(aimDeadzoneShare) => {
            patch({ aimDeadzoneShare });
          }}
        />
        <PercentField
          caption="Зона захвата стика хода, % ширины"
          fraction={tuning.helm.driveZoneShare}
          onChange={(driveZoneShare) => {
            patch({ driveZoneShare: clamp(driveZoneShare, 0.2, 0.8) });
          }}
        />
        <PercentField
          caption="Проекция точки прицела, % кадра"
          fraction={tuning.helm.aimProjectionShare}
          onChange={(aimProjectionShare) => {
            patch({ aimProjectionShare: clamp(aimProjectionShare, 0.1, 1) });
          }}
        />
      </div>

      <h3 className="card__subtitle">Башня</h3>
      <div className="grid">
        <label className="field field--inline">
          <input
            type="checkbox"
            checked={tuning.turretMountedOnHull}
            onChange={(event) => {
              onChange({ ...tuning, turretMountedOnHull: event.target.checked });
            }}
          />
          <span className="field__caption">Башня едет на корпусе</span>
        </label>
      </div>
      <p className="screen__hint">
        Это поле — единственное на вкладке, которое меняет доверенный шаг, а не то, что отправляет
        клиент. В экипаже на двоих и троих турелью по-прежнему управляет наводчик: меняется система
        отсчёта её угла, а не то, кто её ведёт.
      </p>

      <p className="screen__hint">{SCHEME_HINTS[tuning.helm.scheme]}</p>
    </section>
  );
}
