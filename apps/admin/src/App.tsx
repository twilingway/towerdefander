import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ASTEROID_SPAWN_KIND,
  ENEMY_SHAPES,
  ENEMY_ARCHETYPE_ID_PATTERN,
  MAX_ENEMY_ARCHETYPES,
  SPAWN_SECTORS,
  balancePresetsFileSchema,
  type BalancePreset,
  type BalancePresetsFile,
  type BalanceTuning,
  type EnemyArchetype,
  type EnemyShape,
  type SpawnKind,
  type SpawnSector,
  type WaveDefinition,
  type WaveSpawnEntry
} from "@spaceship-defender/protocol";

import {
  BalanceRequestError,
  fetchBalance,
  fetchDefaults,
  saveBalance,
  validateBalance
} from "./balanceClient.js";
import { summariseCampaign, spawnCostOf } from "./waveSummary.js";

const TABS = ["waves", "enemies", "director", "presets"] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, string> = {
  waves: "Волны",
  enemies: "Враги",
  director: "Директор",
  presets: "Пресеты"
};

const SHAPE_LABELS: Record<EnemyShape, string> = {
  arrowhead: "клин",
  block: "блок",
  diamond: "ромб",
  dart: "стрела",
  hexagon: "гекс",
  cross: "крест",
  ring: "кольцо",
  spike: "шип"
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
  readonly onChange: (value: number) => void;
}

function NumberField({ caption, value, step = 1, min = 0, onChange }: NumberFieldProps) {
  return (
    <label className="field">
      <span className="field__caption">{caption}</span>
      <input
        className="field__input"
        type="number"
        step={step}
        min={min}
        value={value}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(next);
        }}
      />
    </label>
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

function createEntry(tuning: BalanceTuning): WaveSpawnEntry {
  const first = spawnKindsOf(tuning)[0] ?? ASTEROID_SPAWN_KIND;
  return { kind: first, count: 2, spawnIntervalTicks: 12, sectors: [] };
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
          между соседними спавнами группы; один тик = 50 мс, то есть 12 тиков = 0.6 с.{" "}
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
                <thead>
                  <tr>
                    <th>Тип</th>
                    <th>Количество</th>
                    <th title="Пауза между спавнами группы; 1 тик = 50 мс">Интервал, тиков</th>
                    <th title="Стороны арены, с которых приходит группа">Секторы</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {wave.entries.map((entry, entryIndex) => (
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
                          min={1}
                          value={entry.spawnIntervalTicks}
                          onChange={(event) => {
                            patchEntry(waveIndex, entryIndex, {
                              spawnIntervalTicks: Math.max(1, Number(event.target.value) || 1)
                            });
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
                  ))}
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

  const patchWeapon = (kind: string, patch: Partial<EnemyArchetype["weapon"]>): void => {
    const current = archetypeOf(kind);
    if (current === undefined) return;
    patchArchetype(kind, { weapon: { ...current.weapon, ...patch } });
  };

  const patchVisual = (kind: string, patch: Partial<EnemyArchetype["visual"]>): void => {
    const current = archetypeOf(kind);
    if (current === undefined) return;
    patchArchetype(kind, { visual: { ...current.visual, ...patch } });
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
              <div className="shapes" role="group" aria-label="Силуэт">
                {ENEMY_SHAPES.map((shape) => (
                  <button
                    key={shape}
                    type="button"
                    className={`sectors__chip${archetype.visual.shape === shape ? " sectors__chip--on" : ""}`}
                    aria-pressed={archetype.visual.shape === shape}
                    onClick={() => {
                      patchVisual(kind, { shape });
                    }}
                  >
                    {SHAPE_LABELS[shape]}
                  </button>
                ))}
              </div>
              <div className="card__grid">
                <label className="field">
                  <span className="field__caption">Цвет корпуса</span>
                  <input
                    className="field__input"
                    type="color"
                    value={archetype.visual.color}
                    onChange={(event) => {
                      patchVisual(kind, { color: event.target.value });
                    }}
                  />
                </label>
                <label className="field">
                  <span className="field__caption">Цвет обводки</span>
                  <input
                    className="field__input"
                    type="color"
                    value={archetype.visual.outline}
                    onChange={(event) => {
                      patchVisual(kind, { outline: event.target.value });
                    }}
                  />
                </label>
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
                  caption="Радиус"
                  value={archetype.radius}
                  onChange={(radius) => {
                    patchArchetype(kind, { radius });
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

              <h4 className="card__subtitle">Оружие</h4>
              <div className="card__grid">
                <label className="field">
                  <span className="field__caption">Тип</span>
                  <select
                    className="field__input"
                    value={archetype.weapon.kind}
                    onChange={(event) => {
                      patchWeapon(kind, {
                        kind: event.target.value === "missile" ? "missile" : "bullet"
                      });
                    }}
                  >
                    <option value="bullet">пуля</option>
                    <option value="missile">ракета</option>
                  </select>
                </label>
                <NumberField
                  caption="Перезарядка, тиков"
                  min={1}
                  value={archetype.weapon.cooldownTicks}
                  onChange={(cooldownTicks) => {
                    patchWeapon(kind, { cooldownTicks: Math.max(1, Math.round(cooldownTicks)) });
                  }}
                />
                <NumberField
                  caption="Урон"
                  value={archetype.weapon.damage}
                  onChange={(damage) => {
                    patchWeapon(kind, { damage });
                  }}
                />
                <NumberField
                  caption="Цена для щита"
                  value={archetype.weapon.shieldHitCost}
                  onChange={(shieldHitCost) => {
                    patchWeapon(kind, { shieldHitCost });
                  }}
                />
                <NumberField
                  caption="Скорость снаряда"
                  value={archetype.weapon.projectileSpeedPerSecond}
                  onChange={(projectileSpeedPerSecond) => {
                    patchWeapon(kind, { projectileSpeedPerSecond });
                  }}
                />
                <NumberField
                  caption="Радиус снаряда"
                  value={archetype.weapon.projectileRadius}
                  onChange={(projectileRadius) => {
                    patchWeapon(kind, { projectileRadius });
                  }}
                />
                <NumberField
                  caption="Жизнь снаряда, тиков"
                  min={1}
                  value={archetype.weapon.projectileLifetimeTicks}
                  onChange={(projectileLifetimeTicks) => {
                    patchWeapon(kind, {
                      projectileLifetimeTicks: Math.max(1, Math.round(projectileLifetimeTicks))
                    });
                  }}
                />
                <NumberField
                  caption="Снарядов в залпе"
                  min={1}
                  value={archetype.weapon.burstCount}
                  onChange={(burstCount) => {
                    patchWeapon(kind, { burstCount: Math.max(1, Math.round(burstCount)) });
                  }}
                />
                <NumberField
                  caption="Разброс залпа, рад"
                  step={0.05}
                  value={archetype.weapon.burstSpreadRadians}
                  onChange={(burstSpreadRadians) => {
                    patchWeapon(kind, { burstSpreadRadians });
                  }}
                />
                <NumberField
                  caption="Поворот ракеты, рад/с"
                  step={0.05}
                  value={archetype.weapon.turnRatePerSecond}
                  onChange={(turnRatePerSecond) => {
                    patchWeapon(kind, { turnRatePerSecond });
                  }}
                />
              </div>
            </article>
          );
        })}
      </div>
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
        <NumberField
          caption="Интервал спавна волны, тиков"
          min={1}
          value={tuning.enemySpawnIntervalTicks}
          onChange={(enemySpawnIntervalTicks) => {
            onChange({
              ...tuning,
              enemySpawnIntervalTicks: Math.max(1, Math.round(enemySpawnIntervalTicks))
            });
          }}
        />
        <NumberField
          caption="Интермиссия, тиков"
          min={1}
          value={tuning.intermissionTicks}
          onChange={(intermissionTicks) => {
            onChange({ ...tuning, intermissionTicks: Math.max(1, Math.round(intermissionTicks)) });
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
      </div>

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
