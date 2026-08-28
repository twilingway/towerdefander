import type { BalanceTuning, HelmTuning } from "@spaceship-defender/protocol";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { HelmScreen } from "./index.js";

/** The screen touches one section, so the fixture stays that section. */
function tuning(helm: HelmTuning): BalanceTuning {
  return { helm } as unknown as BalanceTuning;
}

describe("HelmScreen", () => {
  it("shows the angles in degrees and the nudge as a percentage", () => {
    const markup = renderToStaticMarkup(
      <HelmScreen
        tuning={tuning({
          scheme: "tank",
          headingLeadRadians: Math.PI / 6,
          stopDampening: 1,
          rotateInPlaceThrottle: 0.02
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

  it("patches only the field that changed", () => {
    const onChange = vi.fn();
    const helm: HelmTuning = {
      scheme: "tank",
      headingLeadRadians: 0.5,
      stopDampening: 1,
      rotateInPlaceThrottle: 0.02
    };
    const screen = HelmScreen({ tuning: tuning(helm), onChange });
    const fields = collectOnChange(screen);
    const patchLead = fields[0];
    if (patchLead === undefined) throw new Error("Expected a lead field.");

    patchLead(0.8);

    expect(onChange).toHaveBeenCalledWith({ helm: { ...helm, headingLeadRadians: 0.8 } });
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
