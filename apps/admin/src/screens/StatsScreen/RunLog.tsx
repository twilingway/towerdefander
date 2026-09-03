import type { BatchCell } from "@spaceship-defender/protocol";

import { buildLabel, cellLabel } from "./aggregate.js";

const OUTCOME_LABELS: Record<string, string> = {
  defeat: "поражение",
  victory: "победа",
  unfinished: "не доиграно"
};

const REASON_LABELS: Record<string, string> = {
  spaceship_destroyed: "корпус разрушен",
  wave_timeout: "таймаут волны"
};

/** One row per run, so a suspicious median can be traced to its seed. */
export function RunLog({ cell }: { readonly cell: BatchCell }) {
  return (
    <section className="card">
      <h2>Лог прогонов — {cellLabel(cell.key)}</h2>
      <table className="entries">
        <thead>
          <tr>
            <th scope="col">Сид</th>
            <th scope="col">Волна</th>
            <th scope="col">Очки</th>
            <th scope="col">Длительность</th>
            <th scope="col">Исход</th>
            <th scope="col">Причина</th>
            <th scope="col">Босс</th>
            <th scope="col">Апгрейды</th>
          </tr>
        </thead>
        <tbody>
          {cell.runs.map((run) => (
            <tr key={run.seed}>
              <td>{run.seed}</td>
              <td>{run.wave}</td>
              <td>{run.score}</td>
              <td>{run.seconds} с</td>
              <td>{OUTCOME_LABELS[run.outcome] ?? run.outcome}</td>
              <td>
                {run.defeatReason === null
                  ? "—"
                  : (REASON_LABELS[run.defeatReason] ?? run.defeatReason)}
              </td>
              <td>{run.bossKills}</td>
              <td className="run-log__build">{buildLabel(run.upgrades)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
