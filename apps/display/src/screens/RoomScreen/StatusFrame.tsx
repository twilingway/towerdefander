import {
  STATUS_BARS,
  STATUS_FRAME_HEIGHT,
  STATUS_FRAME_WIDTH,
  type StatusBar,
  type StatusReading
} from "../../model/statusFrame.js";
const percent = (value: number, whole: number): string => `${((value / whole) * 100).toFixed(3)}%`;

const cssColor = (color: number): string => `#${color.toString(16).padStart(6, "0")}`;

/**
 * The rows the live heat writer finds by id and stamps `data-heat` on. They carry
 * no `<small>`, so it has no caption to overwrite with a percentage.
 */
const HEAT_TEST_IDS: Readonly<Partial<Record<StatusBar["key"], string>>> = {
  cannon: "cannon-heat",
  machineGun: "machine-gun-heat"
};

/** A bar's state in words, because a colour alone does not say it; null is the plain bar. */
function barState(
  bar: StatusBar,
  reading: StatusReading
): { readonly key: string; readonly caption: string } | null {
  switch (bar.key) {
    case "cannon":
      return reading.cannonOverheated ? { key: "overheated", caption: "Перегрев" } : null;
    case "machineGun":
      return reading.machineGunOverheated ? { key: "overheated", caption: "Перегрев" } : null;
    case "shield":
      return reading.shieldState === null ? null : { key: "down", caption: reading.shieldState };
    case "hull":
      return reading.hullLow ? { key: "low", caption: "Корпус: мало" } : null;
  }
}

/**
 * The example's status frame in the page: its picture and a cell over every slot
 * it paints. The pause button's cut-out is left to the gear, and a match's sweep
 * stands beside the dial.
 *
 * A cell is lit or it is not, so a commit here only moves a class on the cells
 * that changed, and only when a bar gains or loses one or changes state - not on
 * every patch that moves the heat.
 */
export function StatusFrame({
  reading,
  frameUrl
}: {
  readonly reading: StatusReading;
  readonly frameUrl: string | undefined;
}) {
  return (
    <div className="status-frame" data-testid="status-frame">
      {frameUrl !== undefined && <img className="status-frame__art" src={frameUrl} alt="" />}
      {STATUS_BARS.map((bar, index) => {
        const lights = reading.lit[index] ?? 0;
        const state = barState(bar, reading);
        return (
          <div
            key={bar.key}
            className="status-frame__bar"
            data-bar={bar.key}
            data-lit={lights}
            data-state={state?.key}
            data-testid={HEAT_TEST_IDS[bar.key]}
            style={{ color: cssColor(bar.color) }}
          >
            <span
              className="status-frame__label"
              style={{
                left: percent(bar.labelX, STATUS_FRAME_WIDTH),
                top: percent(bar.labelY, STATUS_FRAME_HEIGHT),
                // Stops short of the first cell, so a long state word on a small
                // frame is cut rather than written across the bar.
                maxWidth: percent(bar.x - bar.labelX - 16, STATUS_FRAME_WIDTH)
              }}
            >
              {state?.caption ?? bar.label}
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
