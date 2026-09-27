import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ArenaSetupScreen } from "./index.js";

const base = {
  ships: [],
  defaultShipId: undefined,
  status: "idle" as const,
  error: "",
  lobby: undefined,
  maintenance: undefined,
  sharedScreen: true,
  onBack: () => undefined,
  onStart: () => undefined,
  onTraining: () => undefined
};

describe("ArenaSetupScreen", () => {
  it("offers training on this device first, and the server beside it", () => {
    const markup = renderToStaticMarkup(<ArenaSetupScreen {...base} serverReach="online" />);

    expect(markup).toMatch(/aria-label="Тренировка"[^>]*aria-pressed="true"/);
    expect(markup).toMatch(/aria-label="Соло"[^>]*aria-pressed="false"/);
    expect(markup).not.toMatch(/aria-label="Соло"[^>]*disabled=""/);
    expect(markup).not.toContain('data-testid="network-notice"');
    // Harnesses find the server tiles by a substring of their names, so the
    // training tile may carry neither.
    expect(markup.match(/aria-label="[^"]*[Сс]оло[^"]*"/g)).toHaveLength(1);
    expect(markup.match(/aria-label="[^"]*Общий экран[^"]*"/g)).toHaveLength(1);
  });

  it("tells a training pilot the ship is theirs to fly", () => {
    const markup = renderToStaticMarkup(<ArenaSetupScreen {...base} serverReach="online" />);

    expect(markup).toContain("Свой корабль ведёте вы");
    expect(markup).not.toContain("летит сам");
  });

  it("dims the network places with no network and keeps training open", () => {
    const markup = renderToStaticMarkup(<ArenaSetupScreen {...base} serverReach="offline" />);

    expect(markup).toContain("Нет подключения к интернету");
    expect(markup).toMatch(/aria-label="Тренировка"[^>]*aria-pressed="true"/);
    expect(markup).not.toMatch(/aria-label="Тренировка"[^>]*disabled=""/);
    expect(markup).toMatch(/aria-label="Соло"[^>]*disabled=""/);
    expect(markup).toMatch(/aria-label="Общий экран"[^>]*disabled=""/);
    expect(markup).toContain("В бой");
  });

  it("closes the server during a maintenance window, not the training", () => {
    const markup = renderToStaticMarkup(
      <ArenaSetupScreen {...base} maintenance={{ active: true, secondsRemaining: 900 }} />
    );

    expect(markup).toContain("maintenance-notice--prominent");
    expect(markup).toMatch(/aria-label="Соло"[^>]*disabled=""/);
    expect(markup).not.toMatch(/aria-label="Тренировка"[^>]*disabled=""/);
  });

  it("dims nothing before the server has answered once", () => {
    const markup = renderToStaticMarkup(<ArenaSetupScreen {...base} />);

    expect(markup).not.toMatch(/aria-label="Соло"[^>]*disabled=""/);
    expect(markup).not.toContain('data-testid="network-notice"');
  });
});
