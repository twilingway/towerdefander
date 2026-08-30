import type { BatchCell, BatchReport } from "@spaceship-defender/protocol";

import {
  LEVEL_LABELS,
  cellLabel,
  outcomeBars,
  reachShare,
  waveByLevel,
  waveByOffset
} from "./aggregate.js";
import { BarChart } from "./charts/BarChart.js";
import { HeatTable, type HeatRow } from "./charts/HeatTable.js";
import { LineChart } from "./charts/LineChart.js";

function heatRows(report: BatchReport): { columns: string[]; rows: HeatRow[] } {
  const offsets = [...new Set(report.cells.map(({ key }) => key.enemyOffset))].sort(
    (left, right) => left - right
  );
  const rowKeys = [
    ...new Map(
      report.cells.map((cell) => [`${cell.key.level}|${String(cell.key.crewSize)}`, cell.key])
    ).values()
  ];
  return {
    columns: offsets.map((offset) => (offset >= 0 ? `+${String(offset)}` : String(offset))),
    rows: rowKeys.map((key) => ({
      label: `${LEVEL_LABELS[key.level] ?? key.level} · экипаж ${String(key.crewSize)}`,
      cells: offsets.map((offset) => {
        const match = report.cells.find(
          (cell) =>
            cell.key.level === key.level &&
            cell.key.crewSize === key.crewSize &&
            cell.key.enemyOffset === offset
        );
        return {
          label: offset >= 0 ? `+${String(offset)}` : String(offset),
          value: match?.wave.median ?? 0
        };
      })
    }))
  };
}

/** How far the crew got, and why it stopped. */
export function OverviewSection({
  report,
  cell
}: {
  readonly report: BatchReport;
  readonly cell: BatchCell | undefined;
}) {
  const heat = heatRows(report);
  const reach = cell === undefined ? undefined : reachShare(cell);
  return (
    <section className="card">
      <h2>Обзор</h2>
      <BarChart title="Медианная волна по уровню автопилота" data={waveByLevel(report)} />
      <LineChart title="Медианная волна по сложности врага" data={waveByOffset(report)} />
      <HeatTable title="Медианная волна по всем осям" columns={heat.columns} rows={heat.rows} />
      {reach !== undefined && cell !== undefined && (
        <LineChart
          title={`Доля прогонов, дошедших до волны — ${cellLabel(cell.key)}`}
          unit="%"
          data={{
            categories: reach.waves.map((wave) => String(wave)),
            series: [{ label: "дошли, %", points: reach.share }]
          }}
        />
      )}
      <BarChart title="Чем закончились прогоны" stacked data={outcomeBars(report.cells)} />
    </section>
  );
}
