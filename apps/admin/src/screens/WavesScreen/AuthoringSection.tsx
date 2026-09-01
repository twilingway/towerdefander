import type { BalanceTuning, CampaignAuthoring } from "@spaceship-defender/protocol";

import { NumberField } from "../../components/fields.js";

interface AuthoringSectionProps {
  readonly tuning: BalanceTuning;
  readonly onChange: (tuning: BalanceTuning) => void;
}

/**
 * The numbers the campaign generator reads. Nothing here reaches a running
 * room: the table below is what the room plays, and this is how that table is
 * rebuilt. Editing a knob and saving changes nothing on its own — the campaign
 * has to be regenerated from it.
 */
export function AuthoringSection({ tuning, onChange }: AuthoringSectionProps) {
  const authoring = tuning.waveCampaign.authoring;
  const patch = (change: Partial<CampaignAuthoring>): void => {
    onChange({
      ...tuning,
      waveCampaign: { ...tuning.waveCampaign, authoring: { ...authoring, ...change } }
    });
  };

  return (
    <section className="card">
      <header className="card__head">
        <h3>Правила сборки кампании</h3>
        <p className="screen__hint">
          По этим числам скрипт пересобирает каталог врагов и таблицу волн. Комната их не читает:
          она играет саму таблицу. Поменяли — надо пересобрать кампанию, иначе останется прежняя.
        </p>
      </header>
      <div className="card__grid">
        <NumberField
          caption="Бюджет первой волны"
          value={authoring.budgetBase}
          step={0.5}
          onChange={(budgetBase) => {
            patch({ budgetBase });
          }}
        />
        <NumberField
          caption="Прирост бюджета за волну"
          value={authoring.budgetGrowth}
          step={0.1}
          onChange={(budgetGrowth) => {
            patch({ budgetGrowth });
          }}
        />
        <NumberField
          caption="Астероиды каждую N-ю волну"
          value={authoring.asteroidEveryWaves}
          min={1}
          onChange={(asteroidEveryWaves) => {
            patch({ asteroidEveryWaves });
          }}
        />
        <NumberField
          caption="Шаг между группами, с"
          value={authoring.groupStartStepSeconds}
          step={0.5}
          onChange={(groupStartStepSeconds) => {
            patch({ groupStartStepSeconds });
          }}
        />
        <NumberField
          caption="Интервал в группе: рой, с"
          value={authoring.swarmIntervalSeconds}
          step={0.5}
          min={0.05}
          onChange={(swarmIntervalSeconds) => {
            patch({ swarmIntervalSeconds });
          }}
        />
        <NumberField
          caption="Интервал в группе: линия, с"
          value={authoring.lineIntervalSeconds}
          step={0.5}
          min={0.05}
          onChange={(lineIntervalSeconds) => {
            patch({ lineIntervalSeconds });
          }}
        />
        <NumberField
          caption="Интервал в группе: тяжёлые, с"
          value={authoring.heavyIntervalSeconds}
          step={0.5}
          min={0.05}
          onChange={(heavyIntervalSeconds) => {
            patch({ heavyIntervalSeconds });
          }}
        />
        <NumberField
          caption="Не раньше какой секунды босс, с"
          value={authoring.bossFloorSeconds}
          step={5}
          onChange={(bossFloorSeconds) => {
            patch({ bossFloorSeconds });
          }}
        />
        <NumberField
          caption="Здоровье: одно попадание пушки"
          value={authoring.hpPerCannonShot}
          step={1}
          min={1}
          onChange={(hpPerCannonShot) => {
            patch({ hpPerCannonShot });
          }}
        />
        <NumberField
          caption="Здоровье: общий множитель"
          value={authoring.hpScale}
          step={0.05}
          min={0.05}
          onChange={(hpScale) => {
            patch({ hpScale });
          }}
        />
        <NumberField
          caption="Потолок урона: постоянная часть"
          value={authoring.damagePerSecondBase}
          step={0.5}
          onChange={(damagePerSecondBase) => {
            patch({ damagePerSecondBase });
          }}
        />
        <NumberField
          caption="Потолок урона: за единицу цены"
          value={authoring.damagePerSecondPerSpawnCost}
          step={0.1}
          onChange={(damagePerSecondPerSpawnCost) => {
            patch({ damagePerSecondPerSpawnCost });
          }}
        />
        <NumberField
          caption="Потолок урона босса, в секунду"
          value={authoring.bossDamagePerSecondCap}
          step={1}
          min={1}
          onChange={(bossDamagePerSecondCap) => {
            patch({ bossDamagePerSecondCap });
          }}
        />
        <NumberField
          caption="Доля урона луча, что засчитывается"
          value={authoring.laserDamageShare}
          step={0.05}
          min={0.05}
          onChange={(laserDamageShare) => {
            patch({ laserDamageShare });
          }}
        />
        <NumberField
          caption="Дальность пушки корабля"
          value={authoring.shipReach}
          step={20}
          min={1}
          onChange={(shipReach) => {
            patch({ shipReach });
          }}
        />
        <NumberField
          caption="Предел дальности врага, доля"
          value={authoring.maxEngagementShare}
          step={0.1}
          min={0.1}
          onChange={(maxEngagementShare) => {
            patch({ maxEngagementShare });
          }}
        />
        <NumberField
          caption="Предел дистанции врага, доля"
          value={authoring.maxStandoffShare}
          step={0.1}
          min={0.1}
          onChange={(maxStandoffShare) => {
            patch({ maxStandoffShare });
          }}
        />
      </div>
    </section>
  );
}
