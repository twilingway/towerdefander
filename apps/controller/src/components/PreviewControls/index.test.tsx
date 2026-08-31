import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ControllerApp } from "../../App.js";
import { PreviewControls } from "./index.js";

describe("layout preview", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the play screen from a fixture instead of the join form", () => {
    vi.stubGlobal("window", { location: { search: "?preview=1" } });

    const markup = renderToStaticMarkup(<ControllerApp />);

    expect(markup).toContain("Превью верстки");
    expect(markup).toContain("Комната PREVIEW");
    expect(markup).not.toContain('name="roomCode"');
  });

  it("keeps the join form without the preview parameter", () => {
    vi.stubGlobal("window", { location: { search: "" } });

    const markup = renderToStaticMarkup(<ControllerApp />);

    expect(markup).toContain('name="roomCode"');
    expect(markup).not.toContain("Превью верстки");
  });

  it("marks the selected crew size, role and phase in the preview switcher", () => {
    const markup = renderToStaticMarkup(
      <PreviewControls
        role="shield"
        phase="intermission"
        crewSize={3}
        onRoleChange={() => undefined}
        onPhaseChange={() => undefined}
        onCrewSizeChange={() => undefined}
      />
    );

    expect(markup).toContain("Оператор щита");
    expect(markup).toContain("Передышка");
    expect(markup.match(/aria-pressed="true"/gu)).toHaveLength(3);
  });

  it("offers only the seats a solo crew has", () => {
    const markup = renderToStaticMarkup(
      <PreviewControls
        role="pilot"
        phase="combat"
        crewSize={1}
        onRoleChange={() => undefined}
        onPhaseChange={() => undefined}
        onCrewSizeChange={() => undefined}
      />
    );

    expect(markup).toContain("Соло");
    expect(markup).toContain("Пилот");
    expect(markup).not.toContain("Оператор щита");
  });

  it("opens expanded and offers a collapse control", () => {
    const markup = renderToStaticMarkup(
      <PreviewControls
        role="pilot"
        phase="combat"
        crewSize={3}
        onRoleChange={() => undefined}
        onPhaseChange={() => undefined}
        onCrewSizeChange={() => undefined}
      />
    );

    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain("Свернуть панель превью");
    expect(markup).not.toContain("preview-controls--collapsed");
  });
});
