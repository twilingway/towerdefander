import {
  STATUS_BARS,
  STATUS_FRAME_HEIGHT,
  STATUS_FRAME_WIDTH,
  type StatusBar,
  type StatusReading
} from "../../model/statusFrame.js";
import { formatScanClock } from "./ArenaHud.js";

const percent = (value: number, whole: number): string => `${((value / whole) * 100).toFixed(3)}%`;

const cssColor = (color: number): string => `#${color.toString(16).padStart(6, "0")}`;

/** The pause button the frame was drawn with, cleared at build time; the sweep takes its place. */
const SCAN_SLOT = { x: 930, y: 0, width: 224, height: 224 } as const;

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
 * The example's status frame in the page: its picture, a cell over every slot it
 * paints, and in a match the sweep where the pause button was.
 *
 * A cell is lit or it is not, so a commit here only moves a class on the cells
 * that changed, and only when a bar gains or loses one or changes state - not on
 * every patch that moves the heat.
 */
export function StatusFrame({
  reading,
  frameUrl,
  onScan
}: {
  readonly reading: StatusReading;
  readonly frameUrl: string | undefined;
  readonly onScan: () => void;
}) {
  const { scan } = reading;
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
                top: percent(bar.labelY, STATUS_FRAME_HEIGHT)
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
      {scan !== null && (
        <button
          type="button"
          className={`status-frame__scan${scan.readySeconds > 0 ? " is-cooling" : ""}`}
          data-testid="arena-scan"
          onClick={onScan}
          disabled={scan.readySeconds > 0}
          // Pinned to the corner the slot sits in, so the 48-pixel floor grows the
          // button into the frame rather than out of it, where it would be clipped.
          style={{
            right: percent(STATUS_FRAME_WIDTH - SCAN_SLOT.x - SCAN_SLOT.width, STATUS_FRAME_WIDTH),
            top: percent(SCAN_SLOT.y, STATUS_FRAME_HEIGHT),
            width: percent(SCAN_SLOT.width, STATUS_FRAME_WIDTH),
            height: percent(SCAN_SLOT.height, STATUS_FRAME_HEIGHT)
          }}
        >
          <span>Скан</span>
          <small>{formatScanClock(scan.readySeconds, scan.revealSecondsRemaining)}</small>
        </button>
      )}
    </div>
  );
}
