import type { BalanceTuning, HelmTuning } from "@spaceship-defender/protocol";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { HelmScreen } from "./index.js";

/** The screen touches one section plus one root flag, so the fixture is those. */
function tuning(helm: HelmTuning, turretMountedOnHull = false): BalanceTuning {
  return { helm, turretMountedOnHull } as unknown as BalanceTuning;
}

const HELM: HelmTuning = {
  scheme: "tank",
  headingLeadRadians: 0.5,
  stopDampening: 1,
  rotateInPlaceThrottle: 0.02,
  driveDeadzoneShare: 0,
  aimDeadzoneShare: 0,
  driveZoneShare: 0.42,
  aimProjectionShare: 0.58
};

describe("HelmScreen", () => {
  it("shows the angles in degrees and the nudge as a percentage", () => {
    const markup = renderToStaticMarkup(
      <HelmScreen
        tuning={tuning({
          scheme: "tank",
          headingLeadRadians: Math.PI / 6,
          stopDampening: 1,
          rotateInPlaceThrottle: 0.02,
          driveDeadzoneShare: 0,
          aimDeadzoneShare: 0,
          driveZoneShare: 0.42,
          aimProjectionShare: 0.58
        })}
        onChange={vi.fn()}
      />
    );

    expect(markup).toContain("Опережение курса");
    expect(markup).toContain("Танковый руль");
    expect(markup).toContain('value="30"');
    expect(markup).toContain('value="1"');
    expect(markup).toContain('value="2"');
  });

  it("shows the stick geometry as percentages of the ring and the frame", () => {
    const markup = renderToStaticMarkup(
      <HelmScreen
        tuning={tuning({ ...HELM, driveDeadzoneShare: 0.12, aimDeadzoneShare: 0.1 })}
        onChange={vi.fn()}
      />
    );

    expect(markup).toContain("Мёртвая зона стика хода");
    expect(markup).toContain('value="12"');
    expect(markup).toContain('value="10"');
    expect(markup).toContain('value="42"');
    expect(markup).toContain('value="58"');
  });

  it("shows the turret mount and says it is the one field the simulation reads", () => {
    const off = renderToStaticMarkup(<HelmScreen tuning={tuning(HELM)} onChange={vi.fn()} />);
    const on = renderToStaticMarkup(<HelmScreen tuning={tuning(HELM, true)} onChange={vi.fn()} />);

    expect(off).toContain("Башня едет на корпусе");
    expect(off).not.toContain('type="checkbox" checked=""');
    expect(on).toContain('type="checkbox" checked=""');
    expect(off).toContain("единственное поле этой вкладки, которое читает симуляция");
  });

  it("keeps the grab zone inside what the schema will accept", () => {
    const onChange = vi.fn();
    const screen = HelmScreen({ tuning: tuning(HELM), onChange });
    const fields = collectOnChange(screen);
    // Order follows the markup: lead, dampening, nudge, then the four shares.
    const patchZone = fields[5];
    if (patchZone === undefined) throw new Error("Expected a grab-zone field.");

    // A percent field happily offers zero; the schema floor is 20%.
    patchZone(0);

    expect(onChange).toHaveBeenCalledWith({
      helm: { ...HELM, driveZoneShare: 0.2 },
      turretMountedOnHull: false
    });
  });

  it("patches only the field that changed", () => {
    const onChange = vi.fn();
    const helm = HELM;
    const screen = HelmScreen({ tuning: tuning(helm), onChange });
    const fields = collectOnChange(screen);
    const patchLead = fields[0];
    if (patchLead === undefined) throw new Error("Expected a lead field.");

    patchLead(0.8);

    expect(onChange).toHaveBeenCalledWith({
      helm: { ...helm, headingLeadRadians: 0.8 },
      turretMountedOnHull: false
    });
  });
});

/** Walks the rendered tree for the field callbacks, in the order they appear. */
function collectOnChange(node: unknown): ((value: number) => void)[] {
  if (node === null || typeof node !== "object") return [];
  const element = node as { props?: Record<string, unknown> };
  const props = element.props ?? {};
  const found: ((value: number) => void)[] = [];
  if (typeof props.onChange === "function" && typeof props.caption === "string") {
    found.push(props.onChange as (value: number) => void);
  }
  const children = props.children;
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) found.push(...collectOnChange(child));
  return found;
}
