import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SoloCockpit, type SoloCockpitProps } from "./index.js";

function props(overrides: Partial<SoloCockpitProps> = {}): SoloCockpitProps {
  return {
    enabled: true,
    driveDeadzoneShare: 0.12,
    aimDeadzoneShare: 0.1,
    onDrive: () => undefined,
    onDriveRelease: () => undefined,
    onAim: () => undefined,
    onAimRelease: () => undefined,
    onMachineGunHold: () => undefined,
    onCannonFromStick: () => undefined,
    onCannonFromTrigger: () => undefined,
    machineGunHeat: 0,
    machineGunOverheated: false,
    cannonHeat: 0,
    cannonOverheated: false,
    aimAssist: true,
    onAimAssistChange: () => undefined,
    ...overrides
  };
}

describe("SoloCockpit", () => {
  it("draws two sticks and two triggers", () => {
    const markup = renderToStaticMarkup(<SoloCockpit {...props()} />);

    expect(markup).toContain('data-testid="cockpit-stick-left"');
    expect(markup).toContain('data-testid="cockpit-stick-right"');
    expect(markup).toContain('data-testid="cockpit-trigger-mg"');
    expect(markup).toContain('data-testid="cockpit-trigger-cannon"');
    // Both sticks are labelled, because a stick nobody can name is a stick a
    // screen reader cannot offer.
    expect(markup).toContain('aria-label="Курс корабля"');
    expect(markup).toContain('aria-label="Наводка турели"');
  });

  it("marks everything disabled outside combat", () => {
    const markup = renderToStaticMarkup(<SoloCockpit {...props({ enabled: false })} />);

    expect(markup).toContain('aria-hidden="true"');
    // Every control says so on its own, not just the container: the zones are
    // what a thumb lands on, and the CSS turns pointer events off from there.
    expect(markup.match(/aria-disabled="true"/g)).toHaveLength(4);
  });

  it("shows an overheated barrel as overheated", () => {
    const markup = renderToStaticMarkup(<SoloCockpit {...props({ cannonOverheated: true })} />);

    expect(markup).toContain('data-overheated="true"');
    // ...and the other barrel is not dragged along with it.
    expect(markup.match(/data-overheated="false"/g)).toHaveLength(1);
  });

  it("says whether the assist is on, and offers the other state", () => {
    const on = renderToStaticMarkup(<SoloCockpit {...props()} />);
    const off = renderToStaticMarkup(<SoloCockpit {...props({ aimAssist: false })} />);

    expect(on).toContain("Помощь вкл");
    expect(off).toContain("Помощь выкл");
    expect(on).toContain('aria-pressed="true"');
  });

  it("draws the heat bar as a share of the barrel's capacity", () => {
    const markup = renderToStaticMarkup(<SoloCockpit {...props({ cannonHeat: 0.5 })} />);

    expect(markup).toContain("scaleY(0.5)");
  });

  it("clamps a heat reading that arrived out of range", () => {
    const markup = renderToStaticMarkup(
      <SoloCockpit {...props({ cannonHeat: 4, machineGunHeat: -1 })} />
    );

    expect(markup).toContain("scaleY(1)");
    expect(markup).toContain("scaleY(0)");
  });
});
