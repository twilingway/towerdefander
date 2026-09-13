import {
  STATUS_BARS,
  STATUS_FRAME_HEIGHT,
  STATUS_FRAME_WIDTH,
  type StatusLit
} from "../../model/statusFrame.js";

const percent = (value: number, whole: number): string => `${((value / whole) * 100).toFixed(3)}%`;

const cssColor = (color: number): string => `#${color.toString(16).padStart(6, "0")}`;

/**
 * The example's status frame in the page: its picture and a cell over every
 * slot it paints.
 *
 * A cell is lit or it is not, so a commit here only
 * moves a class on the cells that changed, and only when a bar gains or loses
 * one - not on every patch that moves the heat.
 */
export function StatusFrame({
  lit,
  frameUrl
}: {
  readonly lit: StatusLit;
  readonly frameUrl: string;
}) {
  return (
    <div className="status-frame" data-testid="status-frame">
      <img className="status-frame__art" src={frameUrl} alt="" />
      {STATUS_BARS.map((bar, index) => {
        const lights = lit[index] ?? 0;
        return (
          <div
            key={bar.key}
            className="status-frame__bar"
            data-bar={bar.key}
            data-lit={lights}
            style={{ color: cssColor(bar.color) }}
          >
            <span
              className="status-frame__label"
              style={{
                left: percent(bar.labelX, STATUS_FRAME_WIDTH),
                top: percent(bar.labelY, STATUS_FRAME_HEIGHT)
              }}
            >
              {bar.label}
            </span>
            {Array.from({ length: bar.cells }, (_unused, cell) => (
              <i
                key={cell}
                className={cell < lights ? "is-lit" : undefined}
                style={{
                  left: percent(bar.x + cell * bar.pitch, STATUS_FRAME_WIDTH),
                  top: percent(bar.y, STATUS_FRAME_HEIGHT),
                  width: percent(bar.width, STATUS_FRAME_WIDTH),
                  height: percent(bar.height, STATUS_FRAME_HEIGHT)
                }}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
