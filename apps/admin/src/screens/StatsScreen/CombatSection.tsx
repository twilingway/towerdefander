import type { BatchCell, BatchReport } from "@spaceship-defender/protocol";

import { accuracyBars, bossRows, cellLabel, compositionByWave, damageByWave } from "./aggregate.js";
import { BarChart } from "./charts/BarChart.js";

/** Who dealt the damage, who took it, and whether the boss ever went down. */
export function CombatSection({
  report,
  cell
}: {
  readonly report: BatchReport;
  readonly cell: BatchCell | undefined;
}) {
  const bosses = cell === undefined ? [] : bossRows(cell);
  return (
    <section className="card">
      <h2>Бой</h2>
      <BarChart title="Точность стволов" unit="%" data={accuracyBars(report.cells)} />
      {cell !== undefined && (
        <>
          <BarChart title={`Урон по волнам — ${cellLabel(cell.key)}`} data={damageByWave(cell)} />
          <BarChart
            title={`Состав волны — ${cellLabel(cell.key)}`}
            stacked
            data={compositionByWave(cell)}
          />
        </>
      )}
      <h3>Босс</h3>
      {bosses.length === 0 ? (
        <p className="hint">
          В выбранной ячейке ни один прогон не дошёл до волны с боссом. Босс-волна определяется по
          составу спавнов, так что прописанная вручную волна тоже считается.
        </p>
      ) : (
        <table className="entries">
          <thead>
            <tr>
              <th scope="col">Волна</th>
              <th scope="col">Дошли</th>
              <th scope="col">Прошли</th>
              <th scope="col">Убийств босса на прогон</th>
            </tr>
          </thead>
          <tbody>
            {bosses.map((row) => (
              <tr key={row.waveNumber}>
                <td>{row.waveNumber}</td>
                <td>{row.reaching}</td>
                <td>{row.cleared}</td>
                <td>{row.kills}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
