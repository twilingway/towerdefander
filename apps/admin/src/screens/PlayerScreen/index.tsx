import { useState } from "react";
import type { BalanceTuning } from "@spaceship-defender/protocol";

import { AppearanceCard } from "./AppearanceCard.js";
import { CannonSection } from "./CannonSection.js";
import { HullSection } from "./HullSection.js";
import { MachineGunSection } from "./MachineGunSection.js";
import { SalvageSection } from "./SalvageSection.js";
import { WeaponKindSection } from "./WeaponKindSection.js";
import { ShieldSection } from "./ShieldSection.js";
import { hullTuning, overrideCount, withHullEdit } from "./hullOverrides.js";

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
  const [hullId, setHullId] = useState("");
  const hull = hullId === "" ? undefined : tuning.shipArchetypes[hullId];
  // Base numbers or one hull on top of them: the sections below never learn
  // which, they get a whole ship either way.
  const shown = hull === undefined ? tuning : hullTuning(tuning, hull);
  const patch = (values: Partial<BalanceTuning>): void => {
    onChange(hull === undefined ? { ...tuning, ...values } : withHullEdit(tuning, hullId, values));
  };

  return (
    <section className="screen">
      <header className="screen__header">
        <h2>Корабль игрока</h2>
        <p className="screen__hint">
          Числа применяются к следующему запуску боя: идущий бой их не подхватывает. Модули дерева
          множат эти значения во время забега и здесь не настраиваются.
        </p>
      </header>

      <article className="card">
        <div className="card__grid">
          <label className="field">
            <span className="field__caption">Чей корабль правим</span>
            <select
              className="field__input"
              value={hullId}
              onChange={(event) => {
                setHullId(event.target.value);
              }}
            >
              <option value="">Базовые числа — общие для всех корпусов</option>
              {Object.entries(tuning.shipArchetypes)
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([id, archetype]) => (
                  <option key={id} value={id}>
                    {archetype.label} · {hullDiffLabel(overrideCount(archetype))}
                  </option>
                ))}
            </select>
          </label>
        </div>
        <p className="screen__hint">
          {hull === undefined
            ? "Правка базового числа доходит до каждого корпуса, который его не переопределил."
            : `Показаны эффективные числа корпуса «${hull.label}»: база плюс его отличия. Правка пишется в отличия этого корпуса, база не меняется; чтобы вернуть поле к базе, введите базовое значение. Силуэт и дерево модулей — на вкладке «Корабли».`}
        </p>
      </article>

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

      {hull === undefined && <AppearanceCard tuning={tuning} patch={patch} />}

      <article className="card">
        <HullSection tuning={shown} patch={patch} />
        <CannonSection tuning={shown} patch={patch} />
        <MachineGunSection tuning={shown} patch={patch} />
        <WeaponKindSection tuning={shown} patch={patch} />
        <ShieldSection tuning={shown} patch={patch} />
        {/* Loot and the silhouettes are one per run, not per hull, so a hull
            cannot override them and they stay on the base numbers. */}
        {hull === undefined && <SalvageSection tuning={tuning} patch={patch} />}
      </article>
    </section>
  );
}

function hullDiffLabel(count: number): string {
  return count === 0 ? "без отличий" : `отличий: ${String(count)}`;
}
