import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ASTEROID_SPAWN_KIND,
  AUTOPILOT_LEVELS,
  CAMERA_VIEW_ASPECT,
  CAMERA_VIEW_WIDTH_MAX,
  CAMERA_VIEW_WIDTH_MIN,
  ENEMY_ARCHETYPE_ID_PATTERN,
  MAX_ENEMY_ARCHETYPES,
  MAX_ENEMY_WEAPONS,
  SPAWN_SECTORS,
  balancePresetsFileSchema,
  type AutopilotLevel,
  type AutopilotProfile,
  type BalancePreset,
  type BalancePresetsFile,
  type BalanceTuning,
  type EnemyArchetype,
  type EnemyWeaponTuning,
  type EntityVisual,
  type SpawnKind,
  type SpawnSector,
  type WaveDefinition,
  type WaveSpawnEntry
} from "@spaceship-defender/protocol";

import { AssetPicker } from "./AssetPicker.js";
import { EnemyPreview } from "./EnemyPreview.js";
import { PlayerShipPreview } from "./PlayerShipPreview.js";
import {
  BalanceRequestError,
  fetchBalance,
  fetchDefaults,
  saveBalance,
  validateBalance
} from "./balanceClient.js";
import {
  TICK_SECONDS,
  entryStats,
  secondsToTicks,
  spawnCostOf,
  summariseCampaign,
  ticksToSeconds,
  weaponReach
} from "./waveSummary.js";

const TABS = ["waves", "enemies", "player", "autopilot", "director", "presets"] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, string> = {
  waves: "Волны",
  enemies: "Враги",
  player: "Игрок",
  autopilot: "Автопилот",
  director: "Директор",
  presets: "Пресеты"
};

const SECTOR_HINTS: Record<SpawnSector, string> = {
  N: "сверху",
  NE: "сверху справа",
  E: "справа",
  SE: "снизу справа",
  S: "снизу",
  SW: "снизу слева",
  W: "слева",
  NW: "сверху слева"
};

const ENTITY_CAPS: readonly (readonly [string, number])[] = [
  ["Корабли", 40],
  ["Астероиды", 16],
  ["Вражеские пули", 96],
  ["Ракеты", 12],
  ["Свои снаряды", 32],
  ["Всего сущностей", 196]
];

function spawnKindsOf(tuning: BalanceTuning): readonly SpawnKind[] {
  return [...Object.keys(tuning.enemyArchetypes).sort(), ASTEROID_SPAWN_KIND];
}

function labelOf(tuning: BalanceTuning, kind: string): string {
  if (kind === ASTEROID_SPAWN_KIND) return "Астероид";
  return tuning.enemyArchetypes[kind]?.label ?? kind;
}

interface SectorPickerProps {
  readonly value: readonly SpawnSector[];
  readonly onChange: (sectors: readonly SpawnSector[]) => void;
}

/** Checkbox chips: nothing ticked means the whole circumference. */
function SectorPicker({ value, onChange }: SectorPickerProps) {
  return (
    <div className="sectors" role="group" aria-label="Секторы появления">
      {SPAWN_SECTORS.map((sector) => {
        const active = value.includes(sector);
        return (
          <button
            key={sector}
            type="button"
            title={SECTOR_HINTS[sector]}
            className={`sectors__chip${active ? " sectors__chip--on" : ""}`}
            aria-pressed={active}
            onClick={() => {
              onChange(active ? value.filter((item) => item !== sector) : [...value, sector]);
            }}
          >
            {sector}
          </button>
        );
      })}
    </div>
  );
}

interface NumberFieldProps {
  readonly caption: string;
  readonly value: number;
  readonly step?: number;
  readonly min?: number;
  readonly disabled?: boolean;
  readonly onChange: (value: number) => void;
}

function NumberField({
  caption,
  value,
  step = 1,
  min = 0,
  disabled = false,
  onChange
}: NumberFieldProps) {
  return (
    <label className={disabled ? "field field--off" : "field"}>
      <span className="field__caption">{caption}</span>
      <input
        className="field__input"
        type="number"
        step={step}
        min={min}
        disabled={disabled}
        value={value}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(next);
        }}
      />
    </label>
  );
}

interface SecondsFieldProps {
  readonly caption: string;
  readonly ticks: number;
  readonly onChange: (ticks: number) => void;
}

/** The simulation counts 50 ms ticks; operators think in seconds. */
function SecondsField({ caption, ticks, onChange }: SecondsFieldProps) {
  return (
    <label className="field">
      <span className="field__caption">{caption}</span>
      <input
        className="field__input"
        type="number"
        step={TICK_SECONDS}
        min={TICK_SECONDS}
        value={ticksToSeconds(ticks)}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next) && next > 0) onChange(secondsToTicks(next));
        }}
      />
    </label>
  );
}

interface DelayFieldProps {
  readonly caption: string;
  readonly ticks: number;
  readonly disabled?: boolean;
  readonly onChange: (ticks: number) => void;
}

/**
 * Seconds like `SecondsField`, except zero is a real value here and means the
 * delay is off. The shared converter deliberately floors at one tick, so this
 * one rounds for itself.
 */
function DelayField({ caption, ticks, disabled = false, onChange }: DelayFieldProps) {
  return (
    <label className={disabled ? "field field--off" : "field"}>
      <span className="field__caption">{caption}</span>
      <input
        className="field__input"
        type="number"
        step={TICK_SECONDS}
        min={0}
        disabled={disabled}
        value={ticksToSeconds(ticks)}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next) && next >= 0) {
            onChange(Math.max(0, Math.round(next / TICK_SECONDS)));
          }
        }}
      />
    </label>
  );
}

interface DegreesFieldProps {
  readonly caption: string;
  readonly radians: number;
  readonly onChange: (radians: number) => void;
}

/** The preset stores angles in radians; operators think in degrees. */
function DegreesField({ caption, radians, onChange }: DegreesFieldProps) {
  return (
    <label className="field">
      <span className="field__caption">{caption}</span>
      <input
        className="field__input"
        type="number"
        step={1}
        min={1}
        value={Math.round((radians * 180) / Math.PI)}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange((next * Math.PI) / 180);
        }}
      />
    </label>
  );
}

interface PercentFieldProps {
  readonly caption: string;
  readonly fraction: number;
  readonly onChange: (fraction: number) => void;
}

/** The preset stores a fraction of a capacity; operators think in percent. */
function PercentField({ caption, fraction, onChange }: PercentFieldProps) {
  return (
    <label className="field">
      <span className="field__caption">{caption}</span>
      <input
        className="field__input"
        type="number"
        step={5}
        min={0}
        max={100}
        value={Math.round(fraction * 100)}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(next / 100);
        }}
      />
    </label>
  );
}

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
  rookie: "Кружит по арене, палит во всё подряд и держит щит, пока есть энергия.",
  veteran: "Держит дистанцию, уходит от ракет, бережёт нагрев и энергию.",
  ace: "Стреляет с полным упреждением, уклоняется от пуль и поднимает щит заранее."
};

/**
 * The demo autopilot. Nothing here reaches the simulation: these numbers drive
 * the bot that plays the visible demo, so an operator can watch one wave
 * through a weaker or a sharper pilot.
 */
function AutopilotScreen({ tuning, onChange }: AutopilotScreenProps) {
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

      <details className="legend">
        <summary>Что значат поля</summary>
        <dl className="legend__list">
          <dt>Задержка реакции</dt>
          <dd>
            сколько новая цель должна продержаться лучшей, прежде чем бот на неё переключится; без
            задержки нос мечется между равными целями
          </dd>
          <dt>Пересмотр цели</dt>
          <dd>как часто бот вообще готов сменить цель, даже если появилась более важная</dd>
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
                caption="Потолок нагрева, %"
                fraction={profile.mgHeatCeiling}
                onChange={(mgHeatCeiling) => {
                  patchProfile(level, { mgHeatCeiling });
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

function activePresetOf(document: BalancePresetsFile): BalancePreset | undefined {
  return document.presets.find(({ id }) => id === document.activePresetId);
}

function withTuning(document: BalancePresetsFile, tuning: BalanceTuning): BalancePresetsFile {
  return {
    ...document,
    presets: document.presets.map((preset) =>
      preset.id === document.activePresetId ? { ...preset, tuning } : preset
    )
  };
}

const DEFAULT_SECTOR: SpawnSector = "N";

function createEntry(tuning: BalanceTuning): WaveSpawnEntry {
  const first = spawnKindsOf(tuning)[0] ?? ASTEROID_SPAWN_KIND;
  return {
    kind: first,
    count: 2,
    spawnIntervalTicks: 12,
    sectors: [DEFAULT_SECTOR],
    hpMultiplier: null,
    tempoMultiplier: null
  };
}

function createWave(tuning: BalanceTuning, previous: WaveDefinition | undefined): WaveDefinition {
  if (previous === undefined) {
    return { entries: [createEntry(tuning)], hpMultiplier: null, tempoMultiplier: null };
  }
  return {
    entries: previous.entries.map((entry) => ({ ...entry })),
    hpMultiplier: previous.hpMultiplier,
    tempoMultiplier: previous.tempoMultiplier
  };
}

interface WavesScreenProps {
  readonly tuning: BalanceTuning;
  readonly onChange: (tuning: BalanceTuning) => void;
}

function WavesScreen({ tuning, onChange }: WavesScreenProps) {
  const summaries = useMemo(() => summariseCampaign(tuning), [tuning]);
  const waves = tuning.waveCampaign.waves;

  const replaceWaves = (next: readonly WaveDefinition[]): void => {
    onChange({ ...tuning, waveCampaign: { ...tuning.waveCampaign, waves: next } });
  };

  const patchWave = (index: number, patch: Partial<WaveDefinition>): void => {
    replaceWaves(waves.map((wave, at) => (at === index ? { ...wave, ...patch } : wave)));
  };

  const patchEntry = (
    waveIndex: number,
    entryIndex: number,
    patch: Partial<WaveSpawnEntry>
  ): void => {
    const wave = waves[waveIndex];
    if (wave === undefined) return;
    patchWave(waveIndex, {
      entries: wave.entries.map((entry, at) => (at === entryIndex ? { ...entry, ...patch } : entry))
    });
  };

  return (
    <section className="screen">
      <header className="screen__header">
        <h2>Кампания волн</h2>
        <p className="screen__hint">
          Волны из таблицы идут точно как записаны. Волны после последней строит процедурный
          директор.
        </p>
        <p className="screen__hint">
          <strong>Тип</strong> — кто спавнится, в скобках его цена в бюджете директора.{" "}
          <strong>Количество</strong> — сколько штук в группе. <strong>Интервал</strong> — пауза
          между соседними спавнами группы, в секундах (шаг 0.05 с — один шаг симуляции).{" "}
          <strong>Секторы</strong> — с каких сторон арены они приходят: N сверху, E справа, S снизу,
          W слева, каждый сектор шириной 45°. Отмечено несколько — каждый спавн случайно берёт один
          из них; не отмечено ничего — приходят со всей окружности. Точка внутри сектора всегда
          выбирается случайно от сида забега.
        </p>
      </header>

      {waves.length === 0 ? (
        <p className="empty">
          Таблица пуста — всю кампанию ведёт директор. Добавьте волну, чтобы задать начало вручную.
        </p>
      ) : null}

      <ol className="wave-list">
        {waves.map((wave, waveIndex) => {
          const summary = summaries[waveIndex];
          return (
            <li className="wave" key={`wave-${String(waveIndex)}`}>
              <div className="wave__head">
                <h3>Волна {waveIndex + 1}</h3>
                <span
                  className={`wave__budget${summary?.overBudget === true ? " wave__budget--over" : ""}`}
                >
                  стоимость {summary?.spawnCost ?? 0} / бюджет директора{" "}
                  {summary?.directorBudget ?? 0}
                </span>
                <span className="wave__meta">
                  {summary?.threatCount ?? 0} целей · вся группа выходит за{" "}
                  {(summary?.spawnSeconds ?? 0).toFixed(1)} с
                </span>
                <button
                  className="button button--ghost"
                  type="button"
                  onClick={() => {
                    replaceWaves(waves.filter((_, at) => at !== waveIndex));
                  }}
                >
                  Удалить волну
                </button>
              </div>

              <table className="entries">
                <colgroup>
                  <col className="entries__col-type" />
                  <col className="entries__col-small" />
                  <col className="entries__col-interval" />
                  <col className="entries__col-sectors" />
                  <col className="entries__col-stat" />
                  <col className="entries__col-stat" />
                  <col className="entries__col-action" />
                </colgroup>
                <thead>
                  <tr>
                    <th>Тип</th>
                    <th>Количество</th>
                    <th title="Пауза между соседними спавнами группы">Интервал, с</th>
                    <th title="Стороны арены, с которых приходит группа">Секторы</th>
                    <th title="HP одной единицы на этой волне с учётом множителя">HP ×</th>
                    <th title="Перезарядка первого орудия на этой волне">Темп ×</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {wave.entries.map((entry, entryIndex) => {
                    const stats = entryStats(tuning, entry, waveIndex + 1);
                    return (
                      <tr key={`entry-${String(waveIndex)}-${String(entryIndex)}`}>
                        <td>
                          <select
                            className="field__input"
                            value={entry.kind}
                            onChange={(event) => {
                              patchEntry(waveIndex, entryIndex, {
                                kind: event.target.value
                              });
                            }}
                          >
                            {spawnKindsOf(tuning).map((kind) => (
                              <option key={kind} value={kind}>
                                {labelOf(tuning, kind)} ({spawnCostOf(tuning, kind)})
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input
                            className="field__input"
                            type="number"
                            min={1}
                            value={entry.count}
                            onChange={(event) => {
                              patchEntry(waveIndex, entryIndex, {
                                count: Math.max(1, Number(event.target.value) || 1)
                              });
                            }}
                          />
                        </td>
                        <td>
                          <input
                            className="field__input"
                            type="number"
                            step={TICK_SECONDS}
                            min={TICK_SECONDS}
                            value={ticksToSeconds(entry.spawnIntervalTicks)}
                            onChange={(event) => {
                              const next = Number(event.target.value);
                              if (Number.isFinite(next) && next > 0) {
                                patchEntry(waveIndex, entryIndex, {
                                  spawnIntervalTicks: secondsToTicks(next)
                                });
                              }
                            }}
                          />
                        </td>
                        <td>
                          <SectorPicker
                            value={entry.sectors}
                            onChange={(sectors) => {
                              patchEntry(waveIndex, entryIndex, { sectors });
                            }}
                          />
                        </td>
                        <td>
                          <div className="stat">
                            <input
                              className="field__input stat__input"
                              type="number"
                              step={0.1}
                              min={0}
                              placeholder="авто"
                              value={entry.hpMultiplier ?? ""}
                              onChange={(event) => {
                                const raw = event.target.value;
                                patchEntry(waveIndex, entryIndex, {
                                  hpMultiplier: raw === "" ? null : Number(raw)
                                });
                              }}
                            />
                            <span className="stat__value">
                              {Math.round(stats.hp)} HP
                              <em>×{stats.hpMultiplier.toFixed(2)}</em>
                            </span>
                          </div>
                        </td>
                        <td>
                          <div className="stat">
                            <input
                              className="field__input stat__input"
                              type="number"
                              step={0.1}
                              min={0}
                              placeholder="авто"
                              value={entry.tempoMultiplier ?? ""}
                              onChange={(event) => {
                                const raw = event.target.value;
                                patchEntry(waveIndex, entryIndex, {
                                  tempoMultiplier: raw === "" ? null : Number(raw)
                                });
                              }}
                            />
                            <span className="stat__value">
                              {stats.cooldownTicks === null
                                ? `урон ${String(stats.damage ?? 0)}`
                                : `выстрел / ${String(ticksToSeconds(stats.cooldownTicks))} с`}
                              <em>×{stats.tempoMultiplier.toFixed(2)}</em>
                            </span>
                          </div>
                        </td>
                        <td>
                          <button
                            className="button button--ghost"
                            type="button"
                            disabled={wave.entries.length === 1}
                            onClick={() => {
                              patchWave(waveIndex, {
                                entries: wave.entries.filter((_, at) => at !== entryIndex)
                              });
                            }}
                          >
                            Убрать
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="wave__foot">
                <button
                  className="button"
                  type="button"
                  onClick={() => {
                    patchWave(waveIndex, { entries: [...wave.entries, createEntry(tuning)] });
                  }}
                >
                  + строка состава
                </button>
                <label className="field field--inline">
                  <span className="field__caption">HP ×</span>
                  <input
                    className="field__input"
                    type="number"
                    step={0.1}
                    min={0}
                    placeholder="по формуле"
                    value={wave.hpMultiplier ?? ""}
                    onChange={(event) => {
                      const raw = event.target.value;
                      patchWave(waveIndex, {
                        hpMultiplier: raw === "" ? null : Number(raw)
                      });
                    }}
                  />
                </label>
                <label className="field field--inline">
                  <span className="field__caption">Темп ×</span>
                  <input
                    className="field__input"
                    type="number"
                    step={0.1}
                    min={0}
                    placeholder="по формуле"
                    value={wave.tempoMultiplier ?? ""}
                    onChange={(event) => {
                      const raw = event.target.value;
                      patchWave(waveIndex, {
                        tempoMultiplier: raw === "" ? null : Number(raw)
                      });
                    }}
                  />
                </label>
              </div>
            </li>
          );
        })}
      </ol>

      <button
        className="button button--primary"
        type="button"
        onClick={() => {
          replaceWaves([...waves, createWave(tuning, waves[waves.length - 1])]);
        }}
      >
        + волна (копия последней)
      </button>
    </section>
  );
}

interface EnemiesScreenProps {
  readonly tuning: BalanceTuning;
  readonly onChange: (tuning: BalanceTuning) => void;
}

function usageOf(tuning: BalanceTuning, kind: string): readonly number[] {
  return tuning.waveCampaign.waves
    .map((wave, index) => (wave.entries.some((entry) => entry.kind === kind) ? index + 1 : 0))
    .filter((waveNumber) => waveNumber > 0);
}

function nextArchetypeId(tuning: BalanceTuning, base: string): string {
  const seed = base.length > 0 ? base : "enemy";
  for (let suffix = 2; suffix < 100; suffix += 1) {
    const candidate = `${seed}${String(suffix)}`;
    if (!Object.hasOwn(tuning.enemyArchetypes, candidate)) return candidate;
  }
  return `${seed}${String(Date.now())}`;
}

function EnemiesScreen({ tuning, onChange }: EnemiesScreenProps) {
  const catalogue = Object.keys(tuning.enemyArchetypes).sort();

  const archetypeOf = (kind: string): EnemyArchetype | undefined => tuning.enemyArchetypes[kind];

  const patchArchetype = (kind: string, patch: Partial<EnemyArchetype>): void => {
    const current = archetypeOf(kind);
    if (current === undefined) return;
    onChange({
      ...tuning,
      enemyArchetypes: { ...tuning.enemyArchetypes, [kind]: { ...current, ...patch } }
    });
  };

  const patchWeapon = (
    kind: string,
    weaponIndex: number,
    patch: Partial<EnemyArchetype["weapons"][number]>
  ): void => {
    const current = archetypeOf(kind);
    if (current === undefined) return;
    patchArchetype(kind, {
      weapons: current.weapons.map((weapon, index) =>
        index === weaponIndex ? { ...weapon, ...patch } : weapon
      )
    });
  };

  const addWeapon = (kind: string): void => {
    const current = archetypeOf(kind);
    if (current === undefined || current.weapons.length >= MAX_ENEMY_WEAPONS) return;
    const last = current.weapons[current.weapons.length - 1];
    if (last === undefined) return;
    patchArchetype(kind, { weapons: [...current.weapons, { ...last }] });
  };

  const removeWeapon = (kind: string, weaponIndex: number): void => {
    const current = archetypeOf(kind);
    if (current === undefined || current.weapons.length === 1) return;
    patchArchetype(kind, {
      weapons: current.weapons.filter((_, index) => index !== weaponIndex)
    });
  };

  const patchVisual = (kind: string, patch: Partial<EnemyArchetype["visual"]>): void => {
    const current = archetypeOf(kind);
    if (current === undefined) return;
    patchArchetype(kind, { visual: { ...current.visual, ...patch } });
  };

  const createArchetype = (): void => {
    if (catalogue.length >= MAX_ENEMY_ARCHETYPES) return;
    const id = nextArchetypeId(tuning, "enemy");
    onChange({
      ...tuning,
      enemyArchetypes: {
        ...tuning.enemyArchetypes,
        [id]: {
          hp: 60,
          radius: 26,
          speedPerSecond: 160,
          preferredDistance: 600,
          weapons: [
            {
              kind: "bullet",
              cooldownTicks: 30,
              damage: 10,
              shieldHitCost: 4,
              projectileRadius: 7,
              projectileSpeedPerSecond: 440,
              projectileLifetimeTicks: 180,
              engagementRange: 1200,
              turnRatePerSecond: Math.PI / 2,
              burstCount: 1,
              burstSpreadRadians: 0,
              visual: null
            }
          ],
          visual: {
            shape: "ship-arrowhead",
            modelScale: 1,
            showHealthBar: false
          },
          label: "Новый враг",
          spawnPolicy: "standard",
          spawnCost: 2,
          unlockWave: 1,
          scoreReward: 20,
          creditReward: 2
        }
      }
    });
  };

  const cloneArchetype = (kind: string): void => {
    const source = archetypeOf(kind);
    if (source === undefined || catalogue.length >= MAX_ENEMY_ARCHETYPES) return;
    const id = nextArchetypeId(tuning, kind);
    onChange({
      ...tuning,
      enemyArchetypes: {
        ...tuning.enemyArchetypes,
        [id]: { ...source, label: `${source.label} (копия)` }
      }
    });
  };

  const removeArchetype = (kind: string): void => {
    const rest = Object.fromEntries(
      Object.entries(tuning.enemyArchetypes).filter(([id]) => id !== kind)
    );
    onChange({ ...tuning, enemyArchetypes: rest });
  };

  const renameArchetype = (kind: string, nextId: string): void => {
    const source = archetypeOf(kind);
    if (source === undefined || nextId === kind) return;
    if (!ENEMY_ARCHETYPE_ID_PATTERN.test(nextId)) return;
    if (Object.hasOwn(tuning.enemyArchetypes, nextId)) return;
    const renamed = Object.fromEntries(
      Object.entries(tuning.enemyArchetypes).map(([id, archetype]) =>
        id === kind ? [nextId, archetype] : [id, archetype]
      )
    );
    onChange({
      ...tuning,
      enemyArchetypes: renamed,
      waveCampaign: {
        ...tuning.waveCampaign,
        waves: tuning.waveCampaign.waves.map((wave) => ({
          ...wave,
          entries: wave.entries.map((entry) =>
            entry.kind === kind ? { ...entry, kind: nextId } : entry
          )
        }))
      }
    });
  };

  return (
    <section className="screen">
      <header className="screen__header">
        <h2>Архетипы врагов</h2>
        <p className="screen__hint">
          Стоимость спавна и волна разблокировки влияют и на таблицу волн, и на директора. Тип с
          появлением «после зачистки волны» выходит из общего пула директора: он приходит последним
          и только когда все остальные угрозы волны уничтожены, а сама волна выбирается интервалом
          босс-волн.
        </p>
      </header>

      <div className="row">
        <button
          className="button button--primary"
          type="button"
          disabled={catalogue.length >= MAX_ENEMY_ARCHETYPES}
          onClick={createArchetype}
        >
          + добавить врага
        </button>
        <span className="screen__hint">
          В каталоге {catalogue.length} из {MAX_ENEMY_ARCHETYPES}
        </span>
      </div>

      <details className="legend">
        <summary>Что означает каждый параметр</summary>
        <dl className="legend__list">
          <dt>HP</dt>
          <dd>здоровье на волне 1; на следующих умножается на множитель волны</dd>
          <dt>Радиус поражения</dt>
          <dd>
            круг, по которому считаются попадания снарядов и удержание врага внутри арены; на превью
            это сплошной бирюзовый круг
          </dd>
          <dt>Масштаб модели</dt>
          <dd>во сколько раз силуэт рисуется крупнее зоны поражения; на попадания не влияет</dd>
          <dt>Скорость</dt>
          <dd>единиц мира в секунду; корабль игроков делает 320</dd>
          <dt>Дистанция</dt>
          <dd>
            на каком удалении от корабля враг старается держаться: ближе — подлетает, дальше —
            отходит, на месте — облетает по дуге
          </dd>
          <dt>Цена спавна</dt>
          <dd>вес при наборе волны процедурным директором; на явные волны из таблицы не влияет</dd>
          <dt>Волна разблокировки</dt>
          <dd>с какой волны директор вправе его брать; в явной таблице не проверяется</dd>
          <dt>Появление</dt>
          <dd>
            в общем потоке волны либо после её зачистки — второй режим выводит тип из обычного пула
            директора, и он приходит только по интервалу босс-волн
          </dd>
          <dt>Очки / Кредиты</dt>
          <dd>
            что получает экипаж за убийство: очки — результат забега, кредиты тратятся на апгрейды
          </dd>
          <dt>Оружие: перезарядка</dt>
          <dd>секунд между выстрелами этого ствола; множитель темпа волны её сокращает</dd>
          <dt>Оружие: урон</dt>
          <dd>сколько снимает одно попадание по корпусу; от волны не растёт</dd>
          <dt>Оружие: цена для щита</dt>
          <dd>
            сколько энергии щита уходит на перехват этого снаряда, если щит смотрит в ту сторону
          </dd>
          <dt>Оружие: жизнь снаряда</dt>
          <dd>через сколько секунд снаряд исчезает сам, даже не попав</dd>
          <dt>Оружие: дальность огня</dt>
          <dd>
            с какого удаления ствол открывает огонь; дальше он молчит и держит заряд, поэтому
            стреляет в тот же тик, когда корабль вошёл в дальность
          </dd>
          <dt>Оружие: залп и разброс</dt>
          <dd>сколько снарядов уходит за одну перезарядку и на какой угол они разложены веером</dd>
          <dt>Оружие: поворот ракеты</dt>
          <dd>
            радиан в секунду — насколько резко ракета доворачивает за кораблём; для пуль не важен
          </dd>
        </dl>
      </details>

      <div className="cards">
        {catalogue.map((kind) => {
          const archetype = archetypeOf(kind);
          if (archetype === undefined) return null;
          const usedIn = usageOf(tuning, kind);
          return (
            <article className="card" key={kind}>
              <header className="card__head">
                <input
                  className="field__input card__name"
                  value={archetype.label}
                  aria-label="Название"
                  onChange={(event) => {
                    patchArchetype(kind, { label: event.target.value });
                  }}
                />
                <input
                  className="field__input card__id"
                  value={kind}
                  aria-label="Идентификатор"
                  spellCheck={false}
                  onChange={(event) => {
                    renameArchetype(kind, event.target.value);
                  }}
                />
                <button
                  className="button"
                  type="button"
                  disabled={catalogue.length >= MAX_ENEMY_ARCHETYPES}
                  onClick={() => {
                    cloneArchetype(kind);
                  }}
                >
                  Копия
                </button>
                <button
                  className="button button--ghost"
                  type="button"
                  disabled={usedIn.length > 0 || catalogue.length === 1}
                  title={
                    usedIn.length > 0
                      ? `Используется в волнах: ${usedIn.join(", ")}`
                      : "Удалить архетип"
                  }
                  onClick={() => {
                    removeArchetype(kind);
                  }}
                >
                  Удалить
                </button>
              </header>
              {usedIn.length > 0 ? (
                <p className="card__usage">В таблице волн: {usedIn.join(", ")}</p>
              ) : null}

              <h4 className="card__subtitle">Внешний вид</h4>
              <div className="appearance">
                <EnemyPreview archetype={archetype} />
                <div className="appearance__controls">
                  <AssetPicker
                    label="Силуэт"
                    value={archetype.visual.shape}
                    categories={["ship", "station", "drone", "boss"]}
                    onChange={(shape) => {
                      if (shape !== null) patchVisual(kind, { shape });
                    }}
                  />
                  <div className="card__grid">
                    <label className="field field--inline">
                      <input
                        type="checkbox"
                        checked={archetype.visual.showHealthBar}
                        onChange={(event) => {
                          patchVisual(kind, { showHealthBar: event.target.checked });
                        }}
                      />
                      <span className="field__caption">Полоса HP над корпусом</span>
                    </label>
                    <NumberField
                      caption="Радиус поражения"
                      value={archetype.radius}
                      onChange={(radius) => {
                        patchArchetype(kind, { radius });
                      }}
                    />
                    <NumberField
                      caption="Масштаб модели"
                      step={0.1}
                      min={0.2}
                      value={archetype.visual.modelScale}
                      onChange={(modelScale) => {
                        patchVisual(kind, {
                          modelScale: Math.min(4, Math.max(0.2, modelScale))
                        });
                      }}
                    />
                  </div>
                </div>
              </div>

              <h4 className="card__subtitle">Характеристики</h4>
              <div className="card__grid">
                <NumberField
                  caption="HP"
                  value={archetype.hp}
                  onChange={(hp) => {
                    patchArchetype(kind, { hp });
                  }}
                />
                <NumberField
                  caption="Скорость"
                  value={archetype.speedPerSecond}
                  onChange={(speedPerSecond) => {
                    patchArchetype(kind, { speedPerSecond });
                  }}
                />
                <NumberField
                  caption="Дистанция"
                  value={archetype.preferredDistance}
                  onChange={(preferredDistance) => {
                    patchArchetype(kind, { preferredDistance });
                  }}
                />
                <NumberField
                  caption="Цена спавна"
                  value={archetype.spawnCost}
                  onChange={(spawnCost) => {
                    patchArchetype(kind, { spawnCost });
                  }}
                />
                <NumberField
                  caption="Волна разблокировки"
                  min={1}
                  value={archetype.unlockWave}
                  onChange={(unlockWave) => {
                    patchArchetype(kind, { unlockWave: Math.max(1, Math.round(unlockWave)) });
                  }}
                />
                <label className="field">
                  <span className="field__caption">Появление</span>
                  <select
                    className="field__input"
                    value={archetype.spawnPolicy}
                    onChange={(event) => {
                      patchArchetype(kind, {
                        spawnPolicy: event.target.value === "boss" ? "boss" : "standard"
                      });
                    }}
                  >
                    <option value="standard">в общем потоке волны</option>
                    <option value="boss">после зачистки волны</option>
                  </select>
                </label>
                <NumberField
                  caption="Очки"
                  value={archetype.scoreReward}
                  onChange={(scoreReward) => {
                    patchArchetype(kind, { scoreReward });
                  }}
                />
                <NumberField
                  caption="Кредиты"
                  value={archetype.creditReward}
                  onChange={(creditReward) => {
                    patchArchetype(kind, { creditReward });
                  }}
                />
              </div>

              <h4 className="card__subtitle">
                Оружие
                <button
                  className="button card__add-weapon"
                  type="button"
                  disabled={archetype.weapons.length >= MAX_ENEMY_WEAPONS}
                  onClick={() => {
                    addWeapon(kind);
                  }}
                >
                  + орудие
                </button>
              </h4>
              {archetype.weapons.map((weapon, weaponIndex) => (
                <div className="weapon" key={`${kind}-weapon-${String(weaponIndex)}`}>
                  <div className="weapon__head">
                    <span className="field__caption">Орудие {weaponIndex + 1}</span>
                    <button
                      className="button button--ghost"
                      type="button"
                      disabled={archetype.weapons.length === 1}
                      onClick={() => {
                        removeWeapon(kind, weaponIndex);
                      }}
                    >
                      Убрать
                    </button>
                  </div>
                  <div className="card__grid">
                    <label className="field">
                      <span className="field__caption">Тип</span>
                      <select
                        className="field__input"
                        value={weapon.kind}
                        onChange={(event) => {
                          patchWeapon(kind, weaponIndex, {
                            kind: event.target.value === "missile" ? "missile" : "bullet"
                          });
                        }}
                      >
                        <option value="bullet">пуля</option>
                        <option value="missile">ракета</option>
                      </select>
                    </label>
                    <SecondsField
                      caption="Перезарядка, с"
                      ticks={weapon.cooldownTicks}
                      onChange={(cooldownTicks) => {
                        patchWeapon(kind, weaponIndex, { cooldownTicks });
                      }}
                    />
                    <NumberField
                      caption="Урон"
                      value={weapon.damage}
                      onChange={(damage) => {
                        patchWeapon(kind, weaponIndex, { damage });
                      }}
                    />
                    <NumberField
                      caption="Цена для щита"
                      value={weapon.shieldHitCost}
                      onChange={(shieldHitCost) => {
                        patchWeapon(kind, weaponIndex, { shieldHitCost });
                      }}
                    />
                    <NumberField
                      caption="Скорость снаряда"
                      value={weapon.projectileSpeedPerSecond}
                      onChange={(projectileSpeedPerSecond) => {
                        patchWeapon(kind, weaponIndex, { projectileSpeedPerSecond });
                      }}
                    />
                    <NumberField
                      caption="Радиус снаряда"
                      value={weapon.projectileRadius}
                      onChange={(projectileRadius) => {
                        patchWeapon(kind, weaponIndex, { projectileRadius });
                      }}
                    />
                    <SecondsField
                      caption="Жизнь снаряда, с"
                      ticks={weapon.projectileLifetimeTicks}
                      onChange={(projectileLifetimeTicks) => {
                        patchWeapon(kind, weaponIndex, { projectileLifetimeTicks });
                      }}
                    />
                    <NumberField
                      caption="Дальность огня"
                      min={1}
                      step={50}
                      value={weapon.engagementRange}
                      onChange={(engagementRange) => {
                        patchWeapon(kind, weaponIndex, {
                          engagementRange: Math.max(1, Math.round(engagementRange))
                        });
                      }}
                    />
                    <NumberField
                      caption="Снарядов в залпе"
                      min={1}
                      value={weapon.burstCount}
                      onChange={(burstCount) => {
                        patchWeapon(kind, weaponIndex, {
                          burstCount: Math.max(1, Math.round(burstCount))
                        });
                      }}
                    />
                    <NumberField
                      caption="Разброс залпа, рад"
                      step={0.05}
                      value={weapon.burstSpreadRadians}
                      onChange={(burstSpreadRadians) => {
                        patchWeapon(kind, weaponIndex, { burstSpreadRadians });
                      }}
                    />
                    <NumberField
                      caption="Поворот ракеты, рад/с"
                      step={0.05}
                      value={weapon.turnRatePerSecond}
                      onChange={(turnRatePerSecond) => {
                        patchWeapon(kind, weaponIndex, { turnRatePerSecond });
                      }}
                    />
                    <NumberField
                      caption="Масштаб снаряда"
                      step={0.1}
                      min={0.2}
                      value={weapon.visual?.modelScale ?? 1}
                      onChange={(modelScale) => {
                        patchWeapon(kind, weaponIndex, {
                          visual: scaleEntityVisual(weapon.visual, modelScale)
                        });
                      }}
                    />
                  </div>
                  <AssetPicker
                    label="Вид снаряда"
                    value={weapon.visual?.shape ?? null}
                    categories={["missile", "weapon"]}
                    allowNone
                    onChange={(shape) => {
                      patchWeapon(kind, weaponIndex, {
                        visual:
                          shape === null
                            ? null
                            : { shape, modelScale: weapon.visual?.modelScale ?? 1 }
                      });
                    }}
                  />
                  <p className="screen__hint">
                    {rangeHint(weapon, archetype.preferredDistance, tuning.cameraViewWidth)}
                  </p>
                </div>
              ))}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function scaleEntityVisual(visual: EntityVisual, modelScale: number): EntityVisual {
  if (visual === null) return null;
  return { ...visual, modelScale: Math.min(4, Math.max(0.2, modelScale)) };
}

interface PlayerScreenProps {
  readonly tuning: BalanceTuning;
  readonly onChange: (tuning: BalanceTuning) => void;
}

/**
 * The crew ship, grouped by the four combat systems the roles operate. The
 * preset stores these flat, under the names the simulation config uses; the
 * grouping lives here because this is where a person needs it.
 */
function PlayerScreen({ tuning, onChange }: PlayerScreenProps) {
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

      <article className="card">
        <h4 className="card__subtitle">Внешний вид</h4>
        <div className="appearance">
          <PlayerShipPreview tuning={tuning} />
          <div className="appearance__controls">
            <AssetPicker
              label="Корпус"
              value={tuning.spaceshipVisual?.shape ?? null}
              categories={["ship"]}
              allowNone
              onChange={(shape) => {
                patch({
                  spaceshipVisual:
                    shape === null
                      ? null
                      : { shape, modelScale: tuning.spaceshipVisual?.modelScale ?? 1 }
                });
              }}
            />
            <div className="card__grid">
              <NumberField
                caption="Масштаб модели"
                step={0.1}
                min={0.2}
                value={tuning.spaceshipVisual?.modelScale ?? 1}
                onChange={(modelScale) => {
                  patch({ spaceshipVisual: scaleEntityVisual(tuning.spaceshipVisual, modelScale) });
                }}
              />
            </div>
            <p className="screen__hint">
              Без выбора корабль рисуется силуэтом по умолчанию. Масштаб меняет только рисунок,
              радиус поражения остаётся своим.
            </p>
          </div>
        </div>
      </article>

      <article className="card">
        <h3 className="card__subtitle">Корпус и ход</h3>
        <div className="card__grid">
          <NumberField
            caption="HP корпуса"
            value={tuning.spaceshipMaxHp}
            onChange={(spaceshipMaxHp) => {
              patch({ spaceshipMaxHp: spaceshipMaxHp });
            }}
          />
          <NumberField
            caption="Радиус поражения"
            value={tuning.spaceshipRadius}
            onChange={(spaceshipRadius) => {
              patch({ spaceshipRadius: spaceshipRadius });
            }}
          />
          <NumberField
            caption="Скорость"
            value={tuning.spaceshipSpeedPerSecond}
            onChange={(spaceshipSpeedPerSecond) => {
              patch({ spaceshipSpeedPerSecond: spaceshipSpeedPerSecond });
            }}
          />
          <NumberField
            caption="Ускорение"
            value={tuning.spaceshipAccelerationPerSecondSquared}
            onChange={(spaceshipAccelerationPerSecondSquared) => {
              patch({
                spaceshipAccelerationPerSecondSquared: spaceshipAccelerationPerSecondSquared
              });
            }}
          />
          <NumberField
            caption="Торможение"
            value={tuning.spaceshipBrakingPerSecondSquared}
            onChange={(spaceshipBrakingPerSecondSquared) => {
              patch({ spaceshipBrakingPerSecondSquared: spaceshipBrakingPerSecondSquared });
            }}
          />
          <NumberField
            caption="Поворот носа, рад/с"
            step={0.05}
            value={tuning.headingMaxAngularSpeedPerSecond}
            onChange={(headingMaxAngularSpeedPerSecond) => {
              patch({ headingMaxAngularSpeedPerSecond: headingMaxAngularSpeedPerSecond });
            }}
          />
          <NumberField
            caption="Разгон поворота, рад/с²"
            step={0.05}
            value={tuning.headingAngularAccelerationPerSecondSquared}
            onChange={(headingAngularAccelerationPerSecondSquared) => {
              patch({
                headingAngularAccelerationPerSecondSquared:
                  headingAngularAccelerationPerSecondSquared
              });
            }}
          />
          <NumberField
            caption="Торможение поворота, рад/с²"
            step={0.05}
            value={tuning.headingAngularBrakingPerSecondSquared}
            onChange={(headingAngularBrakingPerSecondSquared) => {
              patch({
                headingAngularBrakingPerSecondSquared: headingAngularBrakingPerSecondSquared
              });
            }}
          />
        </div>

        <h3 className="card__subtitle">Пушка ганнера</h3>
        <div className="card__grid">
          <NumberField
            caption="Урон"
            value={tuning.friendlyProjectileDamage}
            onChange={(friendlyProjectileDamage) => {
              patch({ friendlyProjectileDamage: friendlyProjectileDamage });
            }}
          />
          <SecondsField
            caption="Перезарядка, с"
            ticks={tuning.fireCooldownTicks}
            onChange={(fireCooldownTicks) => {
              patch({ fireCooldownTicks });
            }}
          />
          <NumberField
            caption="Скорость снаряда"
            value={tuning.projectileSpeedPerSecond}
            onChange={(projectileSpeedPerSecond) => {
              patch({ projectileSpeedPerSecond: projectileSpeedPerSecond });
            }}
          />
          <NumberField
            caption="Радиус снаряда"
            value={tuning.projectileRadius}
            onChange={(projectileRadius) => {
              patch({ projectileRadius: projectileRadius });
            }}
          />
          <NumberField
            caption="Время жизни снаряда, мс"
            value={tuning.projectileLifetimeMs}
            onChange={(projectileLifetimeMs) => {
              patch({ projectileLifetimeMs: Math.max(1, Math.round(projectileLifetimeMs)) });
            }}
          />
          <NumberField
            caption="Поворот турели, рад/с"
            step={0.05}
            value={tuning.turretMaxAngularSpeedPerSecond}
            onChange={(turretMaxAngularSpeedPerSecond) => {
              patch({ turretMaxAngularSpeedPerSecond: turretMaxAngularSpeedPerSecond });
            }}
          />
          <NumberField
            caption="Разгон турели, рад/с²"
            step={0.05}
            value={tuning.turretAngularAccelerationPerSecondSquared}
            onChange={(turretAngularAccelerationPerSecondSquared) => {
              patch({
                turretAngularAccelerationPerSecondSquared: turretAngularAccelerationPerSecondSquared
              });
            }}
          />
          <NumberField
            caption="Торможение турели, рад/с²"
            step={0.05}
            value={tuning.turretAngularBrakingPerSecondSquared}
            onChange={(turretAngularBrakingPerSecondSquared) => {
              patch({ turretAngularBrakingPerSecondSquared: turretAngularBrakingPerSecondSquared });
            }}
          />
        </div>

        <h3 className="card__subtitle">Носовой пулемёт</h3>
        <div className="card__grid">
          <NumberField
            caption="Урон"
            value={tuning.mgDamage}
            onChange={(mgDamage) => {
              patch({ mgDamage: mgDamage });
            }}
          />
          <SecondsField
            caption="Перезарядка, с"
            ticks={tuning.mgFireCooldownTicks}
            onChange={(mgFireCooldownTicks) => {
              patch({ mgFireCooldownTicks });
            }}
          />
          <NumberField
            caption="Скорость снаряда"
            value={tuning.mgProjectileSpeedPerSecond}
            onChange={(mgProjectileSpeedPerSecond) => {
              patch({ mgProjectileSpeedPerSecond: mgProjectileSpeedPerSecond });
            }}
          />
          <NumberField
            caption="Радиус снаряда"
            value={tuning.mgProjectileRadius}
            onChange={(mgProjectileRadius) => {
              patch({ mgProjectileRadius: mgProjectileRadius });
            }}
          />
          <NumberField
            caption="Ёмкость нагрева"
            value={tuning.mgHeatCapacity}
            onChange={(mgHeatCapacity) => {
              patch({ mgHeatCapacity: mgHeatCapacity });
            }}
          />
          <NumberField
            caption="Нагрев за выстрел"
            value={tuning.mgHeatPerShot}
            onChange={(mgHeatPerShot) => {
              patch({ mgHeatPerShot: mgHeatPerShot });
            }}
          />
          <NumberField
            caption="Охлаждение в секунду"
            value={tuning.mgCoolingPerSecond}
            onChange={(mgCoolingPerSecond) => {
              patch({ mgCoolingPerSecond: mgCoolingPerSecond });
            }}
          />
          <NumberField
            caption="Порог возврата в строй"
            value={tuning.mgRearmThreshold}
            onChange={(mgRearmThreshold) => {
              patch({ mgRearmThreshold: mgRearmThreshold });
            }}
          />
        </div>

        <h3 className="card__subtitle">Щит</h3>
        <div className="card__grid">
          <NumberField
            caption="Ёмкость"
            value={tuning.shieldCapacity}
            onChange={(shieldCapacity) => {
              patch({ shieldCapacity: shieldCapacity });
            }}
          />
          <NumberField
            caption="Расход в секунду"
            value={tuning.shieldDrainPerSecond}
            onChange={(shieldDrainPerSecond) => {
              patch({ shieldDrainPerSecond: shieldDrainPerSecond });
            }}
          />
          <NumberField
            caption="Восстановление в секунду"
            value={tuning.shieldRechargePerSecond}
            onChange={(shieldRechargePerSecond) => {
              patch({ shieldRechargePerSecond: shieldRechargePerSecond });
            }}
          />
          <NumberField
            caption="Радиус"
            value={tuning.shieldRadius}
            onChange={(shieldRadius) => {
              patch({ shieldRadius: shieldRadius });
            }}
          />
          <NumberField
            caption="Ширина сектора, рад"
            step={0.05}
            value={tuning.shieldArcRadians}
            onChange={(shieldArcRadians) => {
              patch({ shieldArcRadians: shieldArcRadians });
            }}
          />
          <NumberField
            caption="Поворот сектора, рад/с"
            step={0.05}
            value={tuning.shieldMaxAngularSpeedPerSecond}
            onChange={(shieldMaxAngularSpeedPerSecond) => {
              patch({ shieldMaxAngularSpeedPerSecond: shieldMaxAngularSpeedPerSecond });
            }}
          />
          <NumberField
            caption="Разгон поворота, рад/с²"
            step={0.05}
            value={tuning.shieldAngularAccelerationPerSecondSquared}
            onChange={(shieldAngularAccelerationPerSecondSquared) => {
              patch({
                shieldAngularAccelerationPerSecondSquared: shieldAngularAccelerationPerSecondSquared
              });
            }}
          />
          <NumberField
            caption="Торможение поворота, рад/с²"
            step={0.05}
            value={tuning.shieldAngularBrakingPerSecondSquared}
            onChange={(shieldAngularBrakingPerSecondSquared) => {
              patch({ shieldAngularBrakingPerSecondSquared: shieldAngularBrakingPerSecondSquared });
            }}
          />
        </div>
      </article>
    </section>
  );
}

interface DirectorScreenProps {
  readonly tuning: BalanceTuning;
  readonly onChange: (tuning: BalanceTuning) => void;
}

function DirectorScreen({ tuning, onChange }: DirectorScreenProps) {
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
          кампании.
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
          caption="Интермиссия, с"
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
function rangeHint(
  weapon: EnemyWeaponTuning,
  preferredDistance: number,
  cameraViewWidth: number
): string {
  const reach = weaponReach(weapon);
  const framed = Math.round((cameraViewWidth * CAMERA_VIEW_ASPECT) / 2);
  const base = `Досягаемость снаряда ${String(reach)}, в кадре цель гарантированно видна до ${String(framed)}.`;
  if (weapon.engagementRange > reach) {
    return `${base} Дальность больше досягаемости: часть выстрелов истечёт по пути.`;
  }
  if (weapon.engagementRange < preferredDistance) {
    return `${base} Дальность меньше дистанции удержания ${String(preferredDistance)}: враг зависнет вне неё и не выстрелит.`;
  }
  if (weapon.engagementRange > framed) {
    return `${base} Огонь открывается из-за края экрана.`;
  }
  return base;
}

function clampCameraViewWidth(value: number): number {
  return Math.min(CAMERA_VIEW_WIDTH_MAX, Math.max(CAMERA_VIEW_WIDTH_MIN, Math.round(value)));
}

interface PresetsScreenProps {
  readonly document: BalancePresetsFile;
  readonly onChange: (document: BalancePresetsFile) => void;
  readonly onImportError: (message: string) => void;
}

function PresetsScreen({ document: balanceDocument, onChange, onImportError }: PresetsScreenProps) {
  const fileInput = useRef<HTMLInputElement | null>(null);

  const duplicateActive = (): void => {
    const active = activePresetOf(balanceDocument);
    if (active === undefined) return;
    const id = `${active.id}-copy-${String(balanceDocument.presets.length + 1)}`;
    onChange({
      ...balanceDocument,
      activePresetId: id,
      presets: [...balanceDocument.presets, { ...active, id, name: `${active.name} (копия)` }]
    });
  };

  return (
    <section className="screen">
      <header className="screen__header">
        <h2>Пресеты</h2>
        <p className="screen__hint">
          Активный пресет применяется к следующему запуску боя, идущий бой не меняется.
        </p>
      </header>

      <ul className="presets">
        {balanceDocument.presets.map((preset) => (
          <li className="presets__item" key={preset.id}>
            <label className="presets__pick">
              <input
                type="radio"
                name="active-preset"
                checked={preset.id === balanceDocument.activePresetId}
                onChange={() => {
                  onChange({ ...balanceDocument, activePresetId: preset.id });
                }}
              />
              <span>
                <strong>{preset.name}</strong>
                <code>{preset.id}</code>
              </span>
            </label>
            <button
              className="button button--ghost"
              type="button"
              disabled={balanceDocument.presets.length === 1}
              onClick={() => {
                const remaining = balanceDocument.presets.filter(({ id }) => id !== preset.id);
                const fallback = remaining[0];
                if (fallback === undefined) return;
                onChange({
                  ...balanceDocument,
                  activePresetId:
                    balanceDocument.activePresetId === preset.id
                      ? fallback.id
                      : balanceDocument.activePresetId,
                  presets: remaining
                });
              }}
            >
              Удалить
            </button>
          </li>
        ))}
      </ul>

      <div className="row">
        <button className="button" type="button" onClick={duplicateActive}>
          Копировать активный
        </button>
        <a
          className="button"
          download="balance.json"
          href={`data:application/json;charset=utf-8,${encodeURIComponent(
            JSON.stringify(balanceDocument, null, 2)
          )}`}
        >
          Экспорт JSON
        </a>
        <button
          className="button"
          type="button"
          onClick={() => {
            fileInput.current?.click();
          }}
        >
          Импорт JSON
        </button>
        <input
          ref={fileInput}
          className="hidden-input"
          type="file"
          accept="application/json"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file === undefined) return;
            void file.text().then((text) => {
              try {
                onChange(balancePresetsFileSchema.parse(JSON.parse(text)));
              } catch {
                onImportError("Файл не является корректным документом баланса.");
              }
            });
          }}
        />
      </div>
    </section>
  );
}

export function AdminApp() {
  const [balanceDocument, setBalanceDocument] = useState<BalancePresetsFile | null>(null);
  const [password, setPassword] = useState("");
  const [tab, setTab] = useState<Tab>("waves");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async (secret: string) => {
    setBusy(true);
    setError(null);
    try {
      setBalanceDocument(await fetchBalance(secret));
      setDirty(false);
      setStatus("Загружено с сервера.");
    } catch (cause) {
      setError(cause instanceof BalanceRequestError ? cause.message : "Сервер недоступен.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load("");
  }, [load]);

  const active = balanceDocument === null ? undefined : activePresetOf(balanceDocument);

  const updateTuning = (tuning: BalanceTuning): void => {
    if (balanceDocument === null) return;
    setBalanceDocument(withTuning(balanceDocument, tuning));
    setDirty(true);
    setStatus(null);
  };

  const updateDocument = (next: BalancePresetsFile): void => {
    setBalanceDocument(next);
    setDirty(true);
    setStatus(null);
  };

  const save = async (): Promise<void> => {
    if (balanceDocument === null) return;
    setBusy(true);
    setError(null);
    try {
      // Keep the edited values on screen when the server refuses them.
      setBalanceDocument(await saveBalance(password, balanceDocument));
      setDirty(false);
      setStatus("Сохранено. Новый бой стартует на этом балансе.");
    } catch (cause) {
      setError(cause instanceof BalanceRequestError ? cause.message : "Сохранить не удалось.");
    } finally {
      setBusy(false);
    }
  };

  const check = async (): Promise<void> => {
    if (balanceDocument === null) return;
    setBusy(true);
    setError(null);
    try {
      const result = await validateBalance(password, balanceDocument);
      if (result.valid) {
        setStatus("Проверка пройдена.");
      } else {
        setError(result.message ?? "Документ не прошёл проверку.");
      }
    } catch (cause) {
      setError(cause instanceof BalanceRequestError ? cause.message : "Проверить не удалось.");
    } finally {
      setBusy(false);
    }
  };

  const restoreDefaults = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      setBalanceDocument(await fetchDefaults(password));
      setDirty(true);
      setStatus("Загружены встроенные значения. Сохраните, чтобы применить.");
    } catch (cause) {
      setError(cause instanceof BalanceRequestError ? cause.message : "Дефолты недоступны.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="app">
      <header className="app__bar">
        <h1 className="app__title">Баланс SpaceShip Defender</h1>
        <label className="field field--inline">
          <span className="field__caption">Пароль</span>
          <input
            className="field__input"
            type="password"
            placeholder="только для удалённого доступа"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
            }}
          />
        </label>
        <button
          className="button"
          type="button"
          disabled={busy}
          onClick={() => {
            void load(password);
          }}
        >
          Перечитать
        </button>
        <button
          className="button"
          type="button"
          disabled={busy}
          onClick={() => {
            void check();
          }}
        >
          Проверить
        </button>
        <button
          className="button button--primary"
          type="button"
          disabled={busy || !dirty}
          onClick={() => {
            void save();
          }}
        >
          Сохранить
        </button>
        <button
          className="button button--ghost"
          type="button"
          disabled={busy}
          onClick={() => {
            void restoreDefaults();
          }}
        >
          Встроенные значения
        </button>
      </header>

      {error !== null ? <p className="banner banner--error">{error}</p> : null}
      {status !== null ? <p className="banner banner--ok">{status}</p> : null}
      {dirty ? <p className="banner banner--warn">Есть несохранённые изменения.</p> : null}

      <nav className="tabs">
        {TABS.map((candidate) => (
          <button
            className={`tabs__tab${candidate === tab ? " tabs__tab--active" : ""}`}
            key={candidate}
            type="button"
            onClick={() => {
              setTab(candidate);
            }}
          >
            {TAB_LABELS[candidate]}
          </button>
        ))}
      </nav>

      {balanceDocument === null || active === undefined ? (
        <p className="empty">Баланс ещё не загружен.</p>
      ) : tab === "waves" ? (
        <WavesScreen tuning={active.tuning} onChange={updateTuning} />
      ) : tab === "enemies" ? (
        <EnemiesScreen tuning={active.tuning} onChange={updateTuning} />
      ) : tab === "player" ? (
        <PlayerScreen tuning={active.tuning} onChange={updateTuning} />
      ) : tab === "autopilot" ? (
        <AutopilotScreen tuning={active.tuning} onChange={updateTuning} />
      ) : tab === "director" ? (
        <DirectorScreen tuning={active.tuning} onChange={updateTuning} />
      ) : (
        <PresetsScreen
          document={balanceDocument}
          onChange={updateDocument}
          onImportError={setError}
        />
      )}
    </main>
  );
}
