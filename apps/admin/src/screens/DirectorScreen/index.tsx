import {
  BACKGROUND_DRIFT_SPEED_MAX,
  BACKGROUND_PARALLAX_STRENGTH_MAX,
  ARENA_RADIUS_MAX,
  ARENA_RADIUS_MIN,
  CAMERA_VIEW_ASPECT,
  CAMERA_VIEW_WIDTH_MAX,
  CAMERA_VIEW_WIDTH_MIN,
  NEBULA_PRESETS,
  type BalanceTuning,
  type NebulaPreset
} from "@spaceship-defender/protocol";

import { AssetPicker } from "../../AssetPicker.js";
import { NumberField, SecondsField } from "../../components/fields.js";
import { scaleEntityVisual } from "../../model/tuning.js";

const ENTITY_CAPS: readonly (readonly [string, number])[] = [
  ["Корабли", 40],
  ["Астероиды", 16],
  ["Вражеские пули", 96],
  ["Ракеты", 12],
  ["Свои снаряды", 32],
  ["Всего сущностей", 196]
];

interface DirectorScreenProps {
  readonly tuning: BalanceTuning;
  readonly onChange: (tuning: BalanceTuning) => void;
}

export function DirectorScreen({ tuning, onChange }: DirectorScreenProps) {
  const director = tuning.waveCampaign.director;
  const patchDirector = (patch: Partial<typeof director>): void => {
    onChange({
      ...tuning,
      waveCampaign: { ...tuning.waveCampaign, director: { ...director, ...patch } }
    });
  };

  return (
    <section className="screen">
      <header className="screen__header">
        <h2>Процедурный директор</h2>
        <p className="screen__hint">
          Работает для волн после таблицы. Сложность здесь не убывает — этого требует спека
          кампании. «Пауза между волнами» — то самое ожидание после зачистки волны, в котором экипаж
          выбирает улучшение; ставьте секунду-другую, когда смотрите демонстрацию. Как и всё
          остальное здесь, применяется со следующего запуска боя.
        </p>
      </header>

      <div className="card__grid">
        <NumberField
          caption="Базовый бюджет"
          min={1}
          value={director.baseBudget}
          onChange={(baseBudget) => {
            patchDirector({ baseBudget: Math.max(1, Math.round(baseBudget)) });
          }}
        />
        <NumberField
          caption="Прирост бюджета"
          min={1}
          value={director.budgetGrowth}
          onChange={(budgetGrowth) => {
            patchDirector({ budgetGrowth: Math.max(1, Math.round(budgetGrowth)) });
          }}
        />
        <NumberField
          caption="Предел бюджета"
          min={1}
          value={director.budgetCap}
          onChange={(budgetCap) => {
            patchDirector({ budgetCap: Math.max(1, Math.round(budgetCap)) });
          }}
        />
        <NumberField
          caption="Прирост HP за волну"
          step={0.01}
          value={director.hpGrowth}
          onChange={(hpGrowth) => {
            patchDirector({ hpGrowth });
          }}
        />
        <NumberField
          caption="Предел множителя HP"
          step={0.5}
          value={director.hpMultiplierCap}
          onChange={(hpMultiplierCap) => {
            patchDirector({ hpMultiplierCap });
          }}
        />
        <NumberField
          caption="Прирост темпа за волну"
          step={0.01}
          value={director.tempoGrowth}
          onChange={(tempoGrowth) => {
            patchDirector({ tempoGrowth });
          }}
        />
        <NumberField
          caption="Предел множителя темпа"
          step={0.5}
          value={director.tempoMultiplierCap}
          onChange={(tempoMultiplierCap) => {
            patchDirector({ tempoMultiplierCap });
          }}
        />
        <label className="field">
          <span className="field__caption">Босс каждые N волн</span>
          <input
            className="field__input"
            type="number"
            min={1}
            placeholder="без боссов"
            value={director.bossWaveInterval ?? ""}
            onChange={(event) => {
              const raw = event.target.value;
              patchDirector({
                bossWaveInterval: raw === "" ? null : Math.max(1, Math.round(Number(raw)))
              });
            }}
          />
        </label>
      </div>

      <h3 className="card__subtitle">Опасности и темп</h3>
      <div className="card__grid">
        <SecondsField
          caption="Интервал спавна у директора, с"
          ticks={tuning.enemySpawnIntervalTicks}
          onChange={(enemySpawnIntervalTicks) => {
            onChange({ ...tuning, enemySpawnIntervalTicks });
          }}
        />
        <SecondsField
          caption="Пауза между волнами, с"
          ticks={tuning.intermissionTicks}
          onChange={(intermissionTicks) => {
            onChange({ ...tuning, intermissionTicks });
          }}
        />
        <SecondsField
          caption="Астероид: время жизни, с"
          ticks={tuning.asteroidLifetimeTicks}
          onChange={(asteroidLifetimeTicks) => {
            onChange({ ...tuning, asteroidLifetimeTicks });
          }}
        />
        <SecondsField
          caption="Ambient-астероид: пауза от, с"
          ticks={tuning.ambientAsteroidIntervalMinTicks}
          onChange={(ambientAsteroidIntervalMinTicks) => {
            onChange({ ...tuning, ambientAsteroidIntervalMinTicks });
          }}
        />
        <SecondsField
          caption="Ambient-астероид: пауза до, с"
          ticks={tuning.ambientAsteroidIntervalMaxTicks}
          onChange={(ambientAsteroidIntervalMaxTicks) => {
            onChange({ ...tuning, ambientAsteroidIntervalMaxTicks });
          }}
        />
        <NumberField
          caption="Астероид: HP"
          value={tuning.asteroidHp}
          onChange={(asteroidHp) => {
            onChange({ ...tuning, asteroidHp });
          }}
        />
        <NumberField
          caption="Астероид: урон"
          value={tuning.asteroidDamage}
          onChange={(asteroidDamage) => {
            onChange({ ...tuning, asteroidDamage });
          }}
        />
        <NumberField
          caption="Астероид: скорость"
          value={tuning.asteroidSpeedPerSecond}
          onChange={(asteroidSpeedPerSecond) => {
            onChange({ ...tuning, asteroidSpeedPerSecond });
          }}
        />
        <NumberField
          caption="Астероид: цена спавна"
          min={1}
          value={tuning.asteroidSpawnCost}
          onChange={(asteroidSpawnCost) => {
            onChange({ ...tuning, asteroidSpawnCost: Math.max(1, Math.round(asteroidSpawnCost)) });
          }}
        />
        <NumberField
          caption="Астероид: масштаб модели"
          step={0.1}
          min={0.2}
          value={tuning.asteroidVisual?.modelScale ?? 1}
          onChange={(modelScale) => {
            onChange({
              ...tuning,
              asteroidVisual: scaleEntityVisual(tuning.asteroidVisual, modelScale)
            });
          }}
        />
      </div>
      <AssetPicker
        label="Астероид: внешний вид"
        value={tuning.asteroidVisual?.shape ?? null}
        categories={["drone", "missile"]}
        allowNone
        onChange={(shape) => {
          onChange({
            ...tuning,
            asteroidVisual:
              shape === null ? null : { shape, modelScale: tuning.asteroidVisual?.modelScale ?? 1 }
          });
        }}
      />
      <p className="screen__hint">
        Без выбора астероид рисуется обычным камнем. Силуэт из каталога заменяет его целиком, размер
        по-прежнему берётся из радиуса астероида.
      </p>

      <h3 className="card__subtitle">Размер арены</h3>
      <div className="card__grid">
        <NumberField
          caption="Радиус арены, мировых единиц"
          min={ARENA_RADIUS_MIN}
          step={100}
          value={tuning.arenaRadius}
          onChange={(arenaRadius) => {
            onChange({ ...tuning, arenaRadius: clampArenaRadius(arenaRadius) });
          }}
        />
      </div>
      <p className="screen__hint">
        Мир — квадрат со стороной в два радиуса, то есть {tuning.arenaRadius * 2} единиц, а корабль
        стартует в его центре. Больший радиус разносит врагов дальше и удлиняет волны: спавн и
        зачистка считаются от этой же окружности. Декорации следуют за размером. Арена применяется
        со следующего запуска боя, допустимый диапазон — от {ARENA_RADIUS_MIN} до {ARENA_RADIUS_MAX}
        .
      </p>

      <h3 className="card__subtitle">Камера мира</h3>
      <div className="card__grid">
        <NumberField
          caption="Ширина кадра, мировых единиц"
          min={CAMERA_VIEW_WIDTH_MIN}
          step={50}
          value={tuning.cameraViewWidth}
          onChange={(cameraViewWidth) => {
            onChange({ ...tuning, cameraViewWidth: clampCameraViewWidth(cameraViewWidth) });
          }}
        />
      </div>
      <p className="screen__hint">
        Дисплей показывает не меньше этого участка мира, высота — 9/16 от ширины, то есть{" "}
        {Math.round(tuning.cameraViewWidth * CAMERA_VIEW_ASPECT)} единиц. Чем больше значение, тем
        дальше камера и тем раньше видно подлетающих врагов. Кадр применяется со следующего запуска
        боя, допустимый диапазон — от {CAMERA_VIEW_WIDTH_MIN} до {CAMERA_VIEW_WIDTH_MAX}.
      </p>

      <h3 className="card__subtitle">Космический фон</h3>
      <div className="card__grid">
        <NumberField
          caption="Параллакс от камеры"
          min={0}
          step={0.05}
          value={tuning.background.parallaxStrength}
          onChange={(parallaxStrength) => {
            onChange({
              ...tuning,
              background: clampBackground(tuning.background, { parallaxStrength })
            });
          }}
        />
        <NumberField
          caption="Дрейф фона, px/с"
          min={0}
          step={0.1}
          value={tuning.background.driftSpeed}
          onChange={(driftSpeed) => {
            onChange({ ...tuning, background: clampBackground(tuning.background, { driftSpeed }) });
          }}
        />
        <NumberField
          caption="Небулы: непрозрачность"
          min={0}
          step={0.05}
          value={tuning.background.nebulaAlpha}
          onChange={(nebulaAlpha) => {
            onChange({
              ...tuning,
              background: clampBackground(tuning.background, { nebulaAlpha })
            });
          }}
        />
        <label className="field">
          <span className="field__caption">Небулы</span>
          <select
            className="field__input"
            value={tuning.background.nebulaPreset}
            onChange={(event) => {
              onChange({
                ...tuning,
                background: clampBackground(tuning.background, {
                  nebulaPreset: event.target.value as NebulaPreset
                })
              });
            }}
          >
            {NEBULA_PRESETS.map((preset) => (
              <option key={preset} value={preset}>
                {NEBULA_PRESET_LABELS[preset]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="screen__hint">
        Звёзды, пыль и небулы рисует дисплей под ареной: слои сдвигаются от движения камеры на
        величину параллакса и медленно дрейфуют сами по себе. Применяется со следующего запуска боя;
        симуляция эти значения не читает.
      </p>

      <h3 className="card__subtitle">Лимиты сущностей (только чтение)</h3>
      <ul className="caps">
        {ENTITY_CAPS.map(([caption, value]) => (
          <li className="caps__item" key={caption}>
            <span>{caption}</span>
            <strong>{value}</strong>
          </li>
        ))}
      </ul>
      <p className="screen__hint">
        Лимиты заданы протоколом и ограничивают размер снапшота, поэтому из консоли не меняются.
      </p>
    </section>
  );
}

/**
 * The frame is 16:9, so its shorter half is what a target is guaranteed to be
 * inside; a shooter further out opens fire from beyond the screen edge.
 */
function clampArenaRadius(value: number): number {
  return Math.min(ARENA_RADIUS_MAX, Math.max(ARENA_RADIUS_MIN, Math.round(value)));
}

function clampCameraViewWidth(value: number): number {
  return Math.min(CAMERA_VIEW_WIDTH_MAX, Math.max(CAMERA_VIEW_WIDTH_MIN, Math.round(value)));
}

const NEBULA_PRESET_LABELS: Record<NebulaPreset, string> = {
  blue: "синяя",
  gold: "золотая",
  purple: "фиолетовая",
  green: "зелёная"
};

function clampBackground(
  background: BalanceTuning["background"],
  patch: Partial<BalanceTuning["background"]>
): BalanceTuning["background"] {
  const next = { ...background, ...patch };
  return {
    parallaxStrength: Math.min(
      BACKGROUND_PARALLAX_STRENGTH_MAX,
      Math.max(0, next.parallaxStrength)
    ),
    driftSpeed: Math.min(BACKGROUND_DRIFT_SPEED_MAX, Math.max(0, next.driftSpeed)),
    nebulaAlpha: Math.min(1, Math.max(0, next.nebulaAlpha)),
    nebulaPreset: next.nebulaPreset
  };
}
