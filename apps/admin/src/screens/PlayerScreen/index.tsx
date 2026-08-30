import type { BalanceTuning } from "@spaceship-defender/protocol";

import { AppearanceCard } from "./AppearanceCard.js";
import { CannonSection } from "./CannonSection.js";
import { HullSection } from "./HullSection.js";
import { MachineGunSection } from "./MachineGunSection.js";
import { SalvageSection } from "./SalvageSection.js";
import { WeaponKindSection } from "./WeaponKindSection.js";
import { ShieldSection } from "./ShieldSection.js";

interface PlayerScreenProps {
  readonly tuning: BalanceTuning;
  readonly onChange: (tuning: BalanceTuning) => void;
}

/**
 * The crew ship, grouped by the four combat systems the roles operate. The
 * preset stores these flat, under the names the simulation config uses; the
 * grouping lives here because this is where a person needs it.
 */
export function PlayerScreen({ tuning, onChange }: PlayerScreenProps) {
  const patch = (values: Partial<BalanceTuning>): void => {
    onChange({ ...tuning, ...values });
  };

  return (
    <section className="screen">
      <header className="screen__header">
        <h2>Корабль игрока</h2>
        <p className="screen__hint">
          Числа применяются к следующему запуску боя: идущий бой их не подхватывает. Ролевые
          апгрейды множат эти значения во время забега и здесь не настраиваются.
        </p>
      </header>

      <details className="legend">
        <summary>Что значат поля</summary>
        <dl className="legend__list">
          <dt>Радиус поражения</dt>
          <dd>по этому кругу враги считают попадания; силуэт корпуса на попадания не влияет</dd>
          <dt>Ускорение и торможение</dt>
          <dd>
            единиц в секунду за секунду: первое разгоняет корабль к предельной скорости, второе
            гасит движение, когда пилот отпустил стик
          </dd>
          <dt>Поворот носа</dt>
          <dd>нос доворачивает за вектором пилота, и туда же стреляет носовой пулемёт</dd>
          <dt>Пушка: время жизни снаряда</dt>
          <dd>через сколько миллисекунд снаряд исчезает сам, даже не попав</dd>
          <dt>Пулемёт: ёмкость и нагрев</dt>
          <dd>
            каждый выстрел добавляет нагрев, охлаждение снимает его в секунду; на ёмкости пулемёт
            глохнет и молчит, пока нагрев не упадёт ниже порога возврата
          </dd>
          <dt>Щит: радиус</dt>
          <dd>
            на каком удалении от центра корабля щит перехватывает снаряды; дисплей рисует дугу ровно
            по нему
          </dd>
          <dt>Щит: ширина сектора</dt>
          <dd>сколько радиан закрывает щит; расход идёт, только пока он поднят</dd>
        </dl>
      </details>

      <AppearanceCard tuning={tuning} patch={patch} />

      <article className="card">
        <HullSection tuning={tuning} patch={patch} />
        <CannonSection tuning={tuning} patch={patch} />
        <MachineGunSection tuning={tuning} patch={patch} />
        <WeaponKindSection tuning={tuning} patch={patch} />
        <ShieldSection tuning={tuning} patch={patch} />
        <SalvageSection tuning={tuning} patch={patch} />
      </article>
    </section>
  );
}
