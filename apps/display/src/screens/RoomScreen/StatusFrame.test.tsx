import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { StatusReading } from "../../model/statusFrame.js";
import { StatusFrame } from "./StatusFrame.js";

const CALM: StatusReading = {
  lit: [0, 0, 0, 0],
  cannonOverheated: false,
  machineGunOverheated: false,
  shieldState: null,
  hullLow: false,
  scan: null
};

function frame(overrides: Partial<StatusReading> = {}): string {
  return renderToStaticMarkup(
    <StatusFrame
      reading={{ ...CALM, ...overrides }}
      frameUrl="frame.webp"
      onScan={() => undefined}
    />
  );
}

describe("StatusFrame", () => {
  it("puts a cell over every painted slot, eleven of them on the cannon", () => {
    const markup = frame();

    expect(markup.match(/<i /g)?.length).toBe(41);
    expect(markup).not.toContain("is-lit");
  });

  it("lights exactly the counted cells of each bar", () => {
    const markup = frame({ lit: [11, 5, 0, 3] });

    expect(markup.match(/class="is-lit"/g)?.length).toBe(19);
    expect(markup).toContain('data-bar="cannon" data-lit="11"');
    expect(markup).toContain('data-bar="hull" data-lit="5"');
  });

  it("says each bar's state in words, not only in colour", () => {
    const markup = frame({ cannonOverheated: true, shieldState: "ПОДНИМАЕТСЯ", hullLow: true });

    expect(markup).toContain('data-bar="cannon" data-lit="0" data-state="overheated"');
    expect(markup).toContain(">Перегрев<");
    expect(markup).toContain('data-state="down"');
    expect(markup).toContain(">ПОДНИМАЕТСЯ<");
    expect(markup).toContain(">Корпус: мало<");
    // The machine gun is cool, so it keeps its name.
    expect(markup).toContain(">Пулемёт<");
  });

  it("names the heat rows the live writer stamps, and gives it no caption to overwrite", () => {
    const markup = frame();

    expect(markup).toContain('data-testid="cannon-heat"');
    expect(markup).toContain('data-testid="machine-gun-heat"');
    expect(markup).not.toContain("<small");
  });

  it("has no pause button, and puts the sweep in its place only in a match", () => {
    expect(frame()).not.toContain("<button");

    const cooling = frame({ scan: { readySeconds: 18, revealSecondsRemaining: 0 } });
    expect(cooling).toContain('data-testid="arena-scan"');
    expect(cooling).toContain("disabled");
    expect(cooling).toContain("18 с");
    expect(frame({ scan: { readySeconds: 0, revealSecondsRemaining: 0 } })).toContain("готов");
  });
});
