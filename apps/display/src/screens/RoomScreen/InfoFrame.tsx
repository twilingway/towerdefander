import type { ReactNode } from "react";

/** The source picture's own size; every window below is in its pixels. */
const FRAME_WIDTH = 1767;
const FRAME_HEIGHT = 559;
/**
 * Where a row's caption starts - clear of the diagonal stripes the top row carries
 * at its left end - and where its capsule's contents start and stop short.
 */
const LABEL_LEFT = 160;
const CAPSULE_LEFT = 666;
const CAPSULE_INSET = 24;

/** The three capsules, top to bottom, measured off the source by brightness. */
const CAPSULES = [
  { top: 62, height: 110, right: 1569 },
  { top: 229, height: 110, right: 1414 },
  { top: 392, height: 109, right: 1256 }
] as const;

const percent = (value: number, whole: number): string => `${((value / whole) * 100).toFixed(3)}%`;

export interface InfoFrameRow {
  readonly label: string;
  readonly value: ReactNode;
  readonly valueTestId?: string;
  readonly detail?: ReactNode;
  readonly detailTestId?: string;
}

/**
 * The example's info frame: three rows, each a caption on the left and its
 * number in the row's capsule.
 *
 * The campaign fills it with the wave, the score and the credits; a match with
 * how many are left, how many this pilot took and where they stand.
 */
export function InfoFrame({
  rows,
  frameUrl
}: {
  readonly rows: readonly [InfoFrameRow, InfoFrameRow, InfoFrameRow];
  readonly frameUrl: string | undefined;
}) {
  return (
    <header className="info-frame" data-testid="info-frame">
      {frameUrl !== undefined && <img className="info-frame__art" src={frameUrl} alt="" />}
      {rows.map((row, index) => {
        const capsule = CAPSULES[index] ?? CAPSULES[0];
        const top = percent(capsule.top, FRAME_HEIGHT);
        const height = percent(capsule.height, FRAME_HEIGHT);
        return (
          <div key={row.label} className="info-frame__row">
            <span
              className="info-frame__label"
              style={{
                left: percent(LABEL_LEFT, FRAME_WIDTH),
                width: percent(CAPSULE_LEFT - CAPSULE_INSET - LABEL_LEFT, FRAME_WIDTH),
                top,
                height
              }}
            >
              {row.label}
            </span>
            <span
              className="info-frame__capsule"
              style={{
                left: percent(CAPSULE_LEFT, FRAME_WIDTH),
                width: percent(capsule.right - CAPSULE_INSET - CAPSULE_LEFT, FRAME_WIDTH),
                top,
                height
              }}
            >
              <strong data-testid={row.valueTestId}>{row.value}</strong>
              {row.detail !== undefined && (
                <small data-testid={row.detailTestId}>{row.detail}</small>
              )}
            </span>
          </div>
        );
      })}
    </header>
  );
}
