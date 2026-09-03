import {
  AUTOPILOT_LEVELS,
  CREW_SIZES,
  ENEMY_OFFSETS,
  MAX_BATCH_CELLS,
  MAX_BATCH_RUNS,
  countBatchCells,
  countBatchRuns,
  type BatchProgress,
  type BatchRequest
} from "@spaceship-defender/protocol";

import { LEVEL_LABELS } from "./aggregate.js";

function toggle<T>(values: readonly T[], value: T): T[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

/**
 * Picks the four axes and starts the batch. Every axis must keep at least one
 * value: an empty axis is a request the server refuses, and refusing it here is
 * cheaper than a round trip.
 */
export function BatchLauncher({
  request,
  presetIds,
  shipArchetypeIds,
  running,
  busy,
  onChange,
  onStart,
  onStop
}: {
  readonly request: BatchRequest;
  readonly presetIds: readonly string[];
  /** Hulls of the active preset; the fifth axis of the matrix. */
  readonly shipArchetypeIds: readonly string[];
  readonly running: BatchProgress | null;
  readonly busy: boolean;
  readonly onChange: (request: BatchRequest) => void;
  readonly onStart: () => void;
  readonly onStop: () => void;
}) {
  const cells = countBatchCells(request);
  const runs = countBatchRuns(request);
  // Two ceilings, because they bind independently: many cheap cells stay under
  // the run ceiling and still exceed what one report may hold.
  const tooBig = runs > MAX_BATCH_RUNS || cells > MAX_BATCH_CELLS;

  return (
    <section className="card">
      <h2>Запуск батча</h2>
      <p className="hint">
        Батч крутит настоящую симуляцию без браузера и грузит процессор той же машины, где живут
        комнаты. Одновременно идёт только один.
      </p>

      <div className="axis-row">
        <span className="axis-row__caption">Уровень автопилота</span>
        {AUTOPILOT_LEVELS.map((level) => (
          <label key={level} className="axis-row__option">
            <input
              type="checkbox"
              checked={request.levels.includes(level)}
              onChange={() => {
                const levels = toggle(request.levels, level);
                if (levels.length > 0) onChange({ ...request, levels });
              }}
            />
            {LEVEL_LABELS[level] ?? level}
          </label>
        ))}
      </div>

      <div className="axis-row">
        <span className="axis-row__caption">Сложность врага</span>
        {ENEMY_OFFSETS.map((offset) => (
          <label key={offset} className="axis-row__option">
            <input
              type="checkbox"
              checked={request.enemyOffsets.includes(offset)}
              onChange={() => {
                const enemyOffsets = toggle(request.enemyOffsets, offset);
                if (enemyOffsets.length > 0) onChange({ ...request, enemyOffsets });
              }}
            />
            {offset >= 0 ? `+${String(offset)}` : String(offset)}
          </label>
        ))}
      </div>

      <div className="axis-row">
        <span className="axis-row__caption">Размер экипажа</span>
        {CREW_SIZES.map((crewSize) => (
          <label key={crewSize} className="axis-row__option">
            <input
              type="checkbox"
              checked={request.crewSizes.includes(crewSize)}
              onChange={() => {
                const sizes = toggle(request.crewSizes, crewSize);
                if (sizes.length > 0) onChange({ ...request, crewSizes: sizes });
              }}
            />
            {String(crewSize)}
          </label>
        ))}
      </div>

      <div className="axis-row">
        <span className="axis-row__caption">Пресет</span>
        {presetIds.map((presetId) => (
          <label key={presetId} className="axis-row__option">
            <input
              type="checkbox"
              checked={request.presetIds.includes(presetId)}
              onChange={() => {
                const ids = toggle(request.presetIds, presetId);
                if (ids.length > 0) onChange({ ...request, presetIds: ids });
              }}
            />
            {presetId}
          </label>
        ))}
      </div>

      <div className="axis-row">
        <span className="axis-row__caption">Корпус</span>
        {shipArchetypeIds.map((hullId) => (
          <label key={hullId} className="axis-row__option">
            <input
              type="checkbox"
              checked={request.shipArchetypeIds.includes(hullId)}
              onChange={() => {
                const ids = toggle(request.shipArchetypeIds, hullId);
                if (ids.length > 0) onChange({ ...request, shipArchetypeIds: ids });
              }}
            />
            {hullId}
          </label>
        ))}
      </div>

      <div className="card__grid">
        <label className="field">
          <span>Прогонов на ячейку</span>
          <input
            type="number"
            min={1}
            max={200}
            value={request.runsPerCell}
            onChange={(event) => {
              onChange({ ...request, runsPerCell: Math.max(1, Number(event.target.value)) });
            }}
          />
        </label>
        <label className="field">
          <span>Первый сид</span>
          <input
            type="number"
            min={1}
            value={request.firstSeed}
            onChange={(event) => {
              onChange({ ...request, firstSeed: Math.max(1, Number(event.target.value)) });
            }}
          />
        </label>
        <label className="field">
          <span>Потолок волн</span>
          <input
            type="number"
            min={1}
            max={200}
            value={request.maxWaves}
            onChange={(event) => {
              onChange({ ...request, maxWaves: Math.max(1, Number(event.target.value)) });
            }}
          />
        </label>
        <label className="field">
          <span>Стартовая волна</span>
          <input
            type="number"
            min={1}
            max={200}
            value={request.startWave}
            onChange={(event) => {
              onChange({ ...request, startWave: Math.max(1, Number(event.target.value)) });
            }}
          />
        </label>
      </div>

      <p className={tooBig ? "upgrade-warning" : "hint"}>
        {String(cells)} ячеек × {String(request.runsPerCell)} прогонов = {String(runs)} прогонов
        {cells > MAX_BATCH_CELLS && ` — больше потолка ${String(MAX_BATCH_CELLS)} ячеек`}
        {runs > MAX_BATCH_RUNS && ` — больше потолка ${String(MAX_BATCH_RUNS)} прогонов`}
      </p>

      {running === null ? (
        <button type="button" className="primary" disabled={busy || tooBig} onClick={onStart}>
          Запустить
        </button>
      ) : (
        <div className="batch-progress">
          <p>
            Идёт батч {running.batchId}: {String(running.completedCells)}/
            {String(running.totalCells)} ячеек, {String(running.completedRuns)}/
            {String(running.totalRuns)} прогонов
          </p>
          {running.log.length > 0 && (
            <ol className="batch-progress__log">
              {running.log.slice(-6).map((line, index) => (
                <li key={`${line}-${String(index)}`}>{line}</li>
              ))}
            </ol>
          )}
          <button type="button" onClick={onStop} disabled={busy}>
            Остановить
          </button>
        </div>
      )}
    </section>
  );
}
