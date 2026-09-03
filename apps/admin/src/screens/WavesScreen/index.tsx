import { useMemo } from "react";
import {
  ASTEROID_SPAWN_KIND,
  type BalanceTuning,
  type SpawnKind,
  type SpawnSector,
  type WaveDefinition,
  type WaveSpawnEntry
} from "@spaceship-defender/protocol";

import { SectorPicker } from "../../components/fields.js";
import { AuthoringSection } from "./AuthoringSection.js";
import {
  TICK_SECONDS,
  entryStats,
  secondsToTicks,
  spawnCostOf,
  summariseCampaign,
  ticksToSeconds
} from "../../waveSummary.js";

function spawnKindsOf(tuning: BalanceTuning): readonly SpawnKind[] {
  return [...Object.keys(tuning.enemyArchetypes).sort(), ASTEROID_SPAWN_KIND];
}

function labelOf(tuning: BalanceTuning, kind: string): string {
  if (kind === ASTEROID_SPAWN_KIND) return "Астероид";
  return tuning.enemyArchetypes[kind]?.label ?? kind;
}

const DEFAULT_SECTOR: SpawnSector = "N";

function createEntry(tuning: BalanceTuning): WaveSpawnEntry {
  const first = spawnKindsOf(tuning)[0] ?? ASTEROID_SPAWN_KIND;
  return {
    kind: first,
    count: 2,
    startDelayTicks: 0,
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

export function WavesScreen({ tuning, onChange }: WavesScreenProps) {
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
          <strong>Количество</strong> — сколько штук в группе. <strong>Старт</strong> — на какой
          секунде волны приходит первый из группы: волна играется расписанием, поэтому группы с
          разным стартом идут вперемешку, а порядок строк ничего не решает.{" "}
          <strong>Интервал</strong> — пауза между соседними спавнами группы, в секундах (шаг 0.05 с
          — один шаг симуляции). <strong>Секторы</strong> — с каких сторон арены они приходят: N
          сверху, E справа, S снизу, W слева, каждый сектор шириной 45°. Отмечено несколько — каждый
          спавн случайно берёт один из них; не отмечено ничего — приходят со всей окружности. Точка
          внутри сектора всегда выбирается случайно от сида забега.
        </p>
      </header>

      <AuthoringSection tuning={tuning} onChange={onChange} />

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
                    <th title="Секунда волны, на которой приходит первый из группы">Старт, с</th>
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
                            min={0}
                            value={ticksToSeconds(entry.startDelayTicks)}
                            onChange={(event) => {
                              const next = Number(event.target.value);
                              if (Number.isFinite(next) && next >= 0) {
                                patchEntry(waveIndex, entryIndex, {
                                  startDelayTicks: secondsToTicks(next)
                                });
                              }
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
