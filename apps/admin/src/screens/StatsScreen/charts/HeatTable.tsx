import { extentOf, formatNumber, heatShare } from "./scale.js";

export interface HeatRow {
  readonly label: string;
  readonly cells: readonly { readonly label: string; readonly value: number }[];
}

/**
 * The whole matrix at once: rows are level and crew, columns are the difficulty
 * offset. The number is printed inside every cell, so the colour ramp is a hint
 * and never the only way to read it.
 */
export function HeatTable({
  title,
  columns,
  rows,
  unit = ""
}: {
  readonly title: string;
  readonly columns: readonly string[];
  readonly rows: readonly HeatRow[];
  readonly unit?: string;
}) {
  const extent = extentOf(rows.flatMap((row) => row.cells.map(({ value }) => value)));
  return (
    <figure className="chart chart--table">
      <figcaption className="chart__title">{title}</figcaption>
      <table className="heat">
        <thead>
          <tr>
            <th scope="col" />
            {columns.map((column) => (
              <th key={column} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th scope="row">{row.label}</th>
              {row.cells.map((cell) => (
                <td
                  key={cell.label}
                  className="heat__cell"
                  style={{ opacity: 0.25 + heatShare(cell.value, extent) * 0.75 }}
                  title={`${row.label} · ${cell.label}: ${formatNumber(cell.value)}${unit}`}
                >
                  {formatNumber(cell.value)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
