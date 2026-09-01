import { type BalanceTuning } from "@spaceship-defender/protocol";

import { DelayField, NumberField, PercentField } from "../../components/fields.js";

interface SalvageSectionProps {
  readonly tuning: BalanceTuning;
  readonly patch: (values: Partial<BalanceTuning>) => void;
}

/** Лут: единственный способ вернуть корпус внутри прогона. */
export function SalvageSection({ tuning, patch }: SalvageSectionProps) {
  return (
    <>
      <h3 className="card__subtitle">Лут и ремонт</h3>
      <p className="screen__hint">
        Шанс дропа задаётся на карточке врага, потому что перехватчиков на волне восемь, а босс
        один; одна вероятность им не подходит. Босс роняет ремонт всегда и своего номинала. Здесь —
        что именно даёт подобранное и насколько трудно до него долететь. Все числа подбираются
        прогонами на вкладке «Статистика», а не на глаз: слишком мало — ничего не изменится, слишком
        много — исчезнет смертность. Окно сбора держит уже выигранную волну открытой, пока лут ещё
        на поле: без него последний дроп пропадал бы в передышке, где корабль не летает.
      </p>
      <div className="card__grid">
        <NumberField
          caption="Ремонт корпуса"
          value={tuning.lootRepairShare}
          onChange={(lootRepairShare) => {
            patch({ lootRepairShare });
          }}
        />
        <NumberField
          caption="Энергия щита"
          value={tuning.lootShieldAmount}
          onChange={(lootShieldAmount) => {
            patch({ lootShieldAmount });
          }}
        />
        <PercentField
          caption="Ремонт с босса, % корпуса"
          fraction={tuning.lootBossRepairShare}
          onChange={(lootBossRepairShare) => {
            patch({ lootBossRepairShare: Math.min(1, Math.max(0, lootBossRepairShare)) });
          }}
        />
        <DelayField
          caption="Время жизни"
          ticks={tuning.lootLifetimeTicks}
          onChange={(lootLifetimeTicks) => {
            patch({ lootLifetimeTicks });
          }}
        />
        <DelayField
          caption="Окно сбора"
          ticks={tuning.lootWindowTicks}
          onChange={(lootWindowTicks) => {
            patch({ lootWindowTicks });
          }}
        />
        <DelayField
          caption="Окно сбора, босс"
          ticks={tuning.lootBossWindowTicks}
          onChange={(lootBossWindowTicks) => {
            patch({ lootBossWindowTicks });
          }}
        />
        <NumberField
          caption="Радиус магнита"
          value={tuning.lootMagnetRadius}
          onChange={(lootMagnetRadius) => {
            patch({ lootMagnetRadius });
          }}
        />
        <NumberField
          caption="Ускорение к кораблю"
          value={tuning.lootMagnetAccelerationPerSecondSquared}
          onChange={(lootMagnetAccelerationPerSecondSquared) => {
            patch({ lootMagnetAccelerationPerSecondSquared });
          }}
        />
        <NumberField
          caption="Размер лута"
          value={tuning.lootDropRadius}
          onChange={(lootDropRadius) => {
            patch({ lootDropRadius });
          }}
        />
        <NumberField
          caption="Затухание дрейфа"
          value={tuning.lootDriftDampingPerSecond}
          onChange={(lootDriftDampingPerSecond) => {
            patch({ lootDriftDampingPerSecond });
          }}
        />
      </div>
    </>
  );
}
