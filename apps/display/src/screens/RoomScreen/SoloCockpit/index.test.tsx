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
    machineGunHeat: 0,
    machineGunOverheated: false,
    ...overrides
  };
}

describe("SoloCockpit", () => {
  it("draws two sticks and the one trigger left", () => {
    const markup = renderToStaticMarkup(<SoloCockpit {...props()} />);

    expect(markup).toContain('data-testid="cockpit-stick-left"');
    expect(markup).toContain('data-testid="cockpit-stick-right"');
    expect(markup).toContain('data-testid="cockpit-trigger-mg"');
    /*
     * And not a second one. The cannon fires from the right stick, so a button
     * beside it was a second place to look for one gun - and on a phone it was
     * a second place for a thumb to be, which is the half of the screen the
     * player is trying to see through.
     */
    expect(markup).not.toContain('data-testid="cockpit-trigger-cannon"');
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
    // Three of them: two sticks and the nose gun.
    expect(markup.match(/aria-disabled="true"/g)).toHaveLength(3);
  });

  it("shows an overheated barrel as overheated", () => {
    const hot = renderToStaticMarkup(<SoloCockpit {...props({ machineGunOverheated: true })} />);
    const cool = renderToStaticMarkup(<SoloCockpit {...props()} />);

    expect(hot).toContain('data-overheated="true"');
    expect(cool).toContain('data-overheated="false"');
  });

  it("offers no assist toggle while the aim assist is being reworked", () => {
    const markup = renderToStaticMarkup(<SoloCockpit {...props()} />);

    expect(markup).not.toContain("cockpit-assist");
    expect(markup).not.toContain("Помощь");
  });

  it("draws the heat bar as a share of the barrel's capacity", () => {
    const markup = renderToStaticMarkup(<SoloCockpit {...props({ machineGunHeat: 0.5 })} />);

    expect(markup).toContain("scaleY(0.5)");
  });

  it("clamps a heat reading that arrived out of range", () => {
    const tooHot = renderToStaticMarkup(<SoloCockpit {...props({ machineGunHeat: 4 })} />);
    const belowZero = renderToStaticMarkup(<SoloCockpit {...props({ machineGunHeat: -1 })} />);

    expect(tooHot).toContain("scaleY(1)");
    expect(belowZero).toContain("scaleY(0)");
  });
});
