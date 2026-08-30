import type { BatchHeader } from "@spaceship-defender/protocol";

const STATUS_LABELS: Record<BatchHeader["status"], string> = {
  running: "идёт",
  complete: "готов",
  stopped: "прерван",
  failed: "ошибка"
};

function when(value: number): string {
  return new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function axes(header: BatchHeader): string {
  const { levels, enemyOffsets, crewSizes, presetIds, runsPerCell } = header.request;
  return (
    `${levels.join("/")} · сдвиг ${enemyOffsets.join(",")} · экипаж ${crewSizes.join(",")} · ` +
    `${presetIds.join(",")} · ${String(runsPerCell)}×`
  );
}

/** Batches newest first; a stopped one still shows the cells it managed. */
export function BatchPicker({
  batches,
  droppedForVersion,
  selectedId,
  onSelect
}: {
  readonly batches: readonly BatchHeader[];
  readonly droppedForVersion: number;
  readonly selectedId: string | undefined;
  readonly onSelect: (batchId: string) => void;
}) {
  if (batches.length === 0) {
    return (
      <p className="hint">
        Сохранённых прогонов нет. Запустите батч — отчёт появится здесь.
        {droppedForVersion > 0 &&
          ` Отброшено отчётов чужого формата: ${String(droppedForVersion)}.`}
      </p>
    );
  }
  return (
    <div className="batch-picker">
      <ul className="batch-list" aria-label="Сохранённые батчи">
        {batches.map((batch) => (
          <li key={batch.batchId}>
            <button
              type="button"
              className={`batch-list__item ${batch.batchId === selectedId ? "batch-list__item--active" : ""}`}
              aria-pressed={batch.batchId === selectedId}
              onClick={() => {
                onSelect(batch.batchId);
              }}
            >
              <span className="batch-list__when">{when(batch.startedAtMs)}</span>
              <span className={`batch-list__status batch-list__status--${batch.status}`}>
                {STATUS_LABELS[batch.status]}
              </span>
              <span className="batch-list__cells">
                {String(batch.completedCells)}/{String(batch.totalCells)} ячеек
              </span>
              <span className="batch-list__axes">{axes(batch)}</span>
            </button>
          </li>
        ))}
      </ul>
      {droppedForVersion > 0 && (
        <p className="hint">
          Отброшено отчётов чужого формата: {String(droppedForVersion)}. Измерение не мигрируется —
          у метрики мог измениться смысл.
        </p>
      )}
    </div>
  );
}
